import type { FastifyInstance, FastifyReply } from 'fastify';
import { Readable } from 'stream';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { buildSystemPrompt } from '../utils/promptBuilder';
import { chatToolDefinitions, executeTool, type NavigateAction } from '../utils/chatTools';
import { callChatCompletionWithFallback, type RoutedMessage } from '../utils/llmRouter';
import { redis } from '../utils/redis';
import { env } from '../env';
import { db } from '../db';
import type { AuthUser } from '../types';

const chatSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1),
    })
  ).optional().default([]),
  // Off by default for speed. Flip to true for deeper (slower) reasoning.
  enableThinking: z.boolean().optional().default(false),
});

// Max round-trips through the tool-calling loop before we force a final
// text-only answer, so a confused model can't loop on tool calls forever.
const MAX_TOOL_ROUNDS = 3;

type ChatMessage = RoutedMessage;

// Thin wrapper around the shared main/fallback routing layer - every call
// here already gets the main-model-then-fallback resilience for free.
async function callChatCompletion(
  messages: ChatMessage[],
  includeTools: boolean,
  enableThinking: boolean
): Promise<{ content: string | null; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> {
  return callChatCompletionWithFallback(messages, {
    tools: includeTools ? chatToolDefinitions : undefined,
    temperature: 0.2,
    top_p: 0.7,
    max_tokens: 1024,
    chat_template_kwargs: { enable_thinking: enableThinking, clear_thinking: false },
  });
}

// Some models occasionally leak a malformed pseudo-tool-call into plain
// content (e.g. "call:get_my_classes{}<tool_call|>") instead of populating
// the structured tool_calls field. Treat that as "no real answer yet"
// rather than showing it to the user.
function looksLikeMalformedToolCall(text: string): boolean {
  return /<\|?tool_call\|?>|^\s*call\s*:\s*\w+\s*\{/i.test(text);
}

// Runs the tool-calling loop against the AI provider, hard-scoping every
// tool execution to `user`, and returns the final text answer plus any
// navigate_to_page action the model requested along the way.
async function runToolLoop(
  messages: ChatMessage[],
  user: AuthUser,
  enableThinking: boolean
): Promise<{ content: string; navigateAction?: NavigateAction }> {
  let navigateAction: NavigateAction | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { content, toolCalls } = await callChatCompletion(messages, true, enableThinking);

    if (toolCalls.length === 0) {
      // Some models treat calling navigate_to_page as "done" and skip the
      // actual text answer - force one more text-only turn rather than
      // showing the user a blank bubble.
      if (content && content.trim().length > 0 && !looksLikeMalformedToolCall(content)) {
        return { content, navigateAction };
      }
      if (content && looksLikeMalformedToolCall(content)) {
        messages.push({
          role: 'user',
          content: 'That was not a valid tool call. Please use the function-calling API correctly, not plain text.',
        });
        continue;
      }
      break;
    }

    messages.push({ role: 'assistant', content, tool_calls: toolCalls });

    for (const toolCall of toolCalls) {
      const result = await executeTool(toolCall.function.name, toolCall.function.arguments, user);
      if (result.navigateAction) {
        navigateAction = result.navigateAction;
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.content),
      });
    }
  }

  // Round cap hit, or the model returned no tool calls but also no text -
  // force a final text-only answer with tools disabled.
  messages.push({
    role: 'user',
    content: 'Summarize the answer to my question in one or two sentences, using only the tool results above.',
  });
  const { content } = await callChatCompletion(messages, false, enableThinking);
  return { content: content ?? '', navigateAction };
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.post('/chat', async (request, reply) => {
    const user = request.user!;
    const body = chatSchema.parse(request.body);

    // 1. Rate Limiting via Redis
    const rateLimitKey = `chat:ratelimit:${user.id}`;
    let currentLimit = 0;
    try {
      currentLimit = await redis.incr(rateLimitKey);
      if (currentLimit === 1) {
        await redis.expire(rateLimitKey, 60);
      }
    } catch (err) {
      // Graceful fallback if Redis is down
      console.warn('Redis rate limit increment failed:', err);
    }

    if (currentLimit > 20) {
      reply.status(429).send({ error: 'Rate limit exceeded. Please try again in a moment.' });
      return;
    }

    // Helper function to stream database-driven mock responses
    async function sendMockStream(
      user: { role: string; email: string; id: string },
      message: string,
      reply: FastifyReply
    ) {
      const stream = new Readable({
        read() {}
      });

      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');

      const messageLower = message.toLowerCase();
      let responseText = `Hi! I'm your Concentrate AI assistant. How can I help you manage your virtual classroom operations today?`;
      const derivedName = user.email.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

      if (user.role === 'teacher') {
        // 1. Grading check MUST come first to avoid "how many" overlap
        if (messageLower.includes('grade') || messageLower.includes('evaluate') || messageLower.includes('assignment') || messageLower.includes('submissions')) {
          const pendingCountRes = await db
            .selectFrom('submissions')
            .innerJoin('assignments', 'assignments.id', 'submissions.assignment_id')
            .innerJoin('classes', 'classes.id', 'assignments.class_id')
            .select((eb) => eb.fn.count('submissions.id').as('count'))
            .where('classes.teacher_id', '=', user.id)
            .where('submissions.status', '=', 'submitted')
            .executeTakeFirstOrThrow();
          const pendingCount = Number(pendingCountRes.count);

          responseText = `As your AI assistant, I can see you have **${pendingCount} pending submissions** requiring your grading.\n\nYou can grade student work directly by navigating to your classroom page, selecting an assignment, and opening a student's submission to evaluate the interactive rubric.`;
        } else if (messageLower.includes('student') || messageLower.includes('class') || messageLower.includes('how many')) {
          const classes = await db
            .selectFrom('classes')
            .select(['id', 'name', 'code'])
            .where('teacher_id', '=', user.id)
            .execute();

          const classDetails = await Promise.all(
            classes.map(async (cls) => {
              const studentCountRes = await db
                .selectFrom('student_enrollments')
                .select((eb) => eb.fn.count('id').as('count'))
                .where('class_id', '=', cls.id)
                .where('status', '=', 'active')
                .executeTakeFirstOrThrow();
              return {
                name: cls.name,
                code: cls.code,
                students: Number(studentCountRes.count),
              };
            })
          );

          const classStr = classDetails.length > 0
            ? classDetails.map((c) => `- **${c.name}** (${c.code}): **${c.students}** active students`).join('\n')
            : '- No active classes';

          responseText = `Hello Prof. ${derivedName.split(' ').pop()}!\n\nHere are your active classes and enrolled student counts:\n${classStr}\n\nLet me know if you would like to review pending submissions!`;
        } else if (messageLower.includes('code') || messageLower.includes('javascript') || messageLower.includes('function')) {
          responseText = `Certainly! Here is a JavaScript example of a grading logic function:\n\n\`\`\`javascript\nfunction getLetterGrade(score) {\n  if (score >= 90) return 'A';\n  if (score >= 80) return 'B';\n  if (score >= 70) return 'C';\n  return 'F';\n}\n\nconsole.log(getLetterGrade(85)); // B\n\`\`\`\n\nHope this helper **code block** assists you!`;
        } else {
          responseText = `I'm focused on assisting you with your classroom management, grades, and assignments here at **Concentrate**. For general coding help or other questions, please try a general AI tool.`;
        }
      } else if (user.role === 'student') {
        if (messageLower.includes('assignment') || messageLower.includes('due') || messageLower.includes('work')) {
          const pendingAssignments = await db
            .selectFrom('assignments')
            .innerJoin('student_enrollments', 'student_enrollments.class_id', 'assignments.class_id')
            .leftJoin('submissions', (join) =>
              join.onRef('submissions.assignment_id', '=', 'assignments.id').on('submissions.student_id', '=', user.id)
            )
            .select(['assignments.title', 'assignments.due_date'])
            .where('student_enrollments.student_id', '=', user.id)
            .where('student_enrollments.status', '=', 'active')
            .where('submissions.id', 'is', null)
            .execute();

          const pendingStr = pendingAssignments.length > 0
            ? pendingAssignments.map((a) => `- **${a.title}** (Due: ${a.due_date ? new Date(a.due_date).toLocaleDateString() : 'N/A'})`).join('\n')
            : '- No pending assignments';

          responseText = `Hi ${derivedName.split(' ').shift()}!\n\nHere are your **pending assignments**:\n${pendingStr}\n\nYou can check due dates and submit files directly from the Assignments page.`;
        } else if (messageLower.includes('grade') || messageLower.includes('feedback') || messageLower.includes('score')) {
          const grades = await db
            .selectFrom('grades')
            .innerJoin('assignments', 'assignments.id', 'grades.assignment_id')
            .select(['assignments.title as assignment_title', 'grades.total_score', 'grades.feedback'])
            .where('grades.student_id', '=', user.id)
            .execute();

          const gradeStr = grades.length > 0
            ? grades.map((g) => `- **${g.assignment_title}**: Score **${g.total_score}%** (Feedback: *"${g.feedback || 'None'}"*)`).join('\n')
            : '- No grades received yet';

          responseText = `Hi ${derivedName.split(' ').shift()}!\n\nHere are your **recent grades and feedback**:\n${gradeStr}`;
        } else if (messageLower.includes('code') || messageLower.includes('javascript') || messageLower.includes('function')) {
          responseText = `Certainly! Here is an example of a **JavaScript average calculation function**:\n\n\`\`\`javascript\nfunction calculateAverage(scores) {\n  if (scores.length === 0) return 0;\n  const total = scores.reduce((sum, score) => sum + score, 0);\n  return total / scores.length;\n}\n\n// Example usage:\nconst grades = [90, 85, 95];\nconsole.log(calculateAverage(grades)); // 90\n\`\`\`\n\nHope this **code snippet** helps you with your virtual grading calculations!`;
        } else {
          responseText = `I'm focused on your academic progress and dashboard operations here at **Concentrate**. For general coding help or other questions, please try a general AI tool. Let me know if you'd like to check your **pending assignments** or **course grades**!`;
        }
      } else if (
        messageLower.includes('stat') || messageLower.includes('user') || messageLower.includes('class') ||
        messageLower.includes('grade') || messageLower.includes('platform') || messageLower.includes('how many') ||
        messageLower.includes('suspend')
      ) {
        const totalUsersRes = await db
          .selectFrom('users')
          .select((eb) => eb.fn.count('id').as('count'))
          .executeTakeFirstOrThrow();
        const totalClassesRes = await db
          .selectFrom('classes')
          .select((eb) => eb.fn.count('id').as('count'))
          .executeTakeFirstOrThrow();
        const totalSuspendedRes = await db
          .selectFrom('users')
          .select((eb) => eb.fn.count('id').as('count'))
          .where('is_suspended', '=', true)
          .executeTakeFirstOrThrow();
        const averageGradeRes = await db
          .selectFrom('grades')
          .select((eb) => eb.fn.avg('total_score').as('average'))
          .executeTakeFirst();

        const totalUsers = Number(totalUsersRes.count);
        const totalClasses = Number(totalClassesRes.count);
        const totalSuspended = Number(totalSuspendedRes.count);
        const avgGrade = averageGradeRes?.average !== null && averageGradeRes?.average !== undefined
          ? Math.round(Number(averageGradeRes.average) * 10) / 10
          : 'N/A';

        responseText = `Welcome Admin!\n\nHere are the live **Platform Statistics**:\n- Total registered users: **${totalUsers}**\n- Active classes: **${totalClasses}**\n- Suspended accounts: **${totalSuspended}**\n- Platform-wide average grade: **${avgGrade}%**`;
      } else {
        responseText = `I'm focused on assisting you with platform administration here at **Concentrate** — user counts, class stats, suspensions, and grade averages. For general questions, please try a general AI tool. Let me know if you'd like a **platform statistics** summary!`;
      }

      // Asynchronously push data into the stream
      const pushStream = async () => {
        await new Promise((resolve) => setImmediate(resolve));
        const words = responseText.split(' ');
        for (let i = 0; i < words.length; i++) {
          const wordChunk = (i === 0 ? '' : ' ') + words[i];
          stream.push(`data: ${JSON.stringify({ content: wordChunk })}\n\n`);
          if (env.NODE_ENV !== 'test') {
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        }
        stream.push('data: [DONE]\n\n');
        stream.push(null);
      };

      pushStream();
      return reply.send(stream);
    }

    // Streams a final answer word-by-word to preserve the existing typing
    // UX, followed by an optional navigate action chunk, then [DONE].
    function streamFinalAnswer(text: string, navigateAction: NavigateAction | undefined, reply: FastifyReply) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const words = text.split(' ');
      for (let i = 0; i < words.length; i++) {
        const wordChunk = (i === 0 ? '' : ' ') + words[i];
        reply.raw.write(`data: ${JSON.stringify({ content: wordChunk })}\n\n`);
      }

      if (navigateAction) {
        reply.raw.write(`data: ${JSON.stringify({ action: navigateAction })}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    }

    // 2. AI Provider Call (Fallback to Mock Stream if API Key is missing/dummy/unresponsive)
    const isDummyKey = env.NODE_ENV !== 'test' && (
      !env.AI_API_KEY ||
      env.AI_API_KEY === 'your-api-key' ||
      env.AI_API_KEY.startsWith('mock') ||
      env.AI_API_KEY.trim() === ''
    );

    if (isDummyKey || !env.AI_API_KEY) {
      return sendMockStream(user, body.message, reply);
    }

    const systemPrompt = await buildSystemPrompt(user);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...body.conversationHistory,
      { role: 'user', content: body.message },
    ];

    try {
      const { content, navigateAction } = await runToolLoop(messages, user, body.enableThinking);
      streamFinalAnswer(content, navigateAction, reply);
    } catch (err) {
      // Both the main and fallback models failed (llmRouter already retried).
      console.warn('AI provider call failed (main + fallback), falling back to mock stream:', err);
      return sendMockStream(user, body.message, reply);
    }
  });
}
