import { db } from '../db';
import type { AuthUser } from '../types';
import type { UserRole } from '../db/types';

// Paths the model is allowed to suggest via the navigate_to_page tool, per
// role. `[id]` / `[assignmentId]` placeholders must be replaced with a real
// id the model already learned from a tool result before it calls
// navigate_to_page - never a placeholder string.
const NAVIGATION_HINTS: Record<UserRole, string[]> = {
  student: [
    '/dashboard/student',
    '/dashboard/student/grades',
    '/dashboard/student/grades/[id] (a single grade\'s detail page - needs a real grade_id from get_my_grades)',
    '/dashboard/assignments (all of this student\'s assignments across every enrolled class - use this for a general "show me my assignments" request with no specific class named)',
    '/dashboard/classes (this student\'s enrolled classes, plus enrolling in a new one - use this for a general "show me my classes" request)',
    '/dashboard/student/classes/[id] (needs a real class id from get_my_classes)',
    '/dashboard/student/classes/[id]/assignments/[assignmentId] (needs real ids from get_my_classes / get_my_assignments)',
  ],
  teacher: [
    '/dashboard/teacher',
    '/dashboard/assignments (all assignments across every class this teacher teaches - use this for a general "show me my assignments" request with no specific class named)',
    '/dashboard/classes (all classes this teacher teaches, plus creating a new one - use this for a general "show me my classes" request)',
    '/dashboard/teacher/classes/[id] (needs a real class id from get_my_classes)',
    '/dashboard/teacher/assignments/[id] (needs a real assignment id)',
    '/dashboard/teacher/assignments/[id]/grade (needs a real assignment id)',
  ],
  admin: [
    '/dashboard/admin',
    '/dashboard/admin/schools/[id] (needs a real school id - call get_schools first, never guess or invent one)',
    '/dashboard/classes',
  ],
};

// Small, static persona + hard anti-hallucination rule. Unlike the old
// implementation, this does NOT dump the user's data up front - the model
// must call a tool on demand for any specific fact, which is what actually
// prevents it from inventing grades/names/dates.
export async function buildSystemPrompt(user: AuthUser): Promise<string> {
  const userRecord = await db
    .selectFrom('users')
    .select('name')
    .where('id', '=', user.id)
    .executeTakeFirst();
  const name = userRecord?.name || 'User';
  const role = user.role;
  const date = new Date().toLocaleDateString();
  const navHints = NAVIGATION_HINTS[role].map((hint) => `- ${hint}`).join('\n');

  return `You are an intelligent assistant embedded in Concentrate — a Canvas-style school management platform.

Current user: ${name}, Role: ${role}
Today's date: ${date}

You must call the appropriate tool before answering any question about specific grades, assignments, classes, students, or platform statistics. Never invent or guess numbers, names, or dates — only state what a tool result returned. If no tool covers the question, say so plainly rather than fabricating an answer.

When a tool result includes an explicit count field (e.g. total_count, class_count), state that exact number verbatim — never count array items yourself or estimate, since you are prone to miscounting when composing a summary sentence. When a tool result includes an already-formatted date string, repeat it exactly as given — never recompute, reformat, or shift it by a day.

If the user's question implies wanting to go somewhere in the app, call navigate_to_page after answering, with a real path and a short button label. Valid paths for this user's role:
${navHints}

Calling navigate_to_page only makes a button appear below your reply — it does NOT move the user anywhere by itself. The user must click that button. Never say "I've navigated you", "I have redirected you", or anything implying the move already happened. Instead, phrase it as an offer or instruction, e.g. "Click below to view your grades," or simply let the button speak for itself without narrating the navigation at all.

Never write markdown links like [label](/some/path) in your reply text — navigate_to_page is the only mechanism for offering a clickable destination.

Be concise, helpful, and professional.`;
}
