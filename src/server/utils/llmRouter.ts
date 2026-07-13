import { env } from '../env';

// Fixed fallback model on the same NVIDIA NIM integrate API. Only ever used
// when the main model (env.AI_MODEL) errors, returns a non-2xx status, or
// times out - the main model stays the default path for every request.
const FALLBACK_MODEL = 'mistralai/mistral-medium-3.5-128b';

// Per-call timeouts. Each model gets its own fresh AbortController, so a
// timed-out main-model call can never poison the fallback attempt (reusing
// an already-aborted signal would make the fallback fail instantly too).
const MAIN_MODEL_TIMEOUT_MS = 20000;
const FALLBACK_MODEL_TIMEOUT_MS = 35000;

export interface RoutedMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
}

export interface RoutedToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ChatCompletionOptions {
  tools?: unknown;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  chat_template_kwargs?: Record<string, unknown>;
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: RoutedToolCall[];
  modelUsed: string;
}

function preview(content: string | null): string {
  if (!content) return '';
  return content.length > 80 ? `${content.slice(0, 80)}…` : content;
}

async function requestCompletion(
  model: string,
  messages: RoutedMessage[],
  options: ChatCompletionOptions,
  timeoutMs: number,
  includeChatTemplateKwargs: boolean
): Promise<{ content: string | null; toolCalls: RoutedToolCall[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(options.tools ? { tools: options.tools, tool_choice: 'auto' } : {}),
        temperature: options.temperature ?? 0.2,
        top_p: options.top_p ?? 0.7,
        max_tokens: options.max_tokens ?? 1024,
        // chat_template_kwargs is a vLLM/tokenizer-specific extension the
        // main model supports but Mistral's tokenizer rejects outright
        // (400 "chat_template is not supported for Mistral tokenizers") -
        // never send it on the fallback call.
        ...(includeChatTemplateKwargs && options.chat_template_kwargs
          ? { chat_template_kwargs: options.chat_template_kwargs }
          : {}),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI API returned status ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error('AI API returned no message');
    }

    return { content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
  } finally {
    clearTimeout(timeout);
  }
}

// Single entry point for every chat-completion request in the app. Tries
// the main model first; if that throws for any reason (network error,
// non-2xx status, or timeout), logs the failure and retries once against a
// fixed fallback model on the same NIM endpoint. Only throws if BOTH the
// main and fallback calls fail, so callers can treat this as "one call that
// occasionally takes longer," not "two calls to coordinate."
export async function callChatCompletionWithFallback(
  messages: RoutedMessage[],
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const mainStart = Date.now();
  try {
    const result = await requestCompletion(env.AI_MODEL, messages, options, MAIN_MODEL_TIMEOUT_MS, true);
    console.log(
      `[llmRouter] model=${env.AI_MODEL} latency=${Date.now() - mainStart}ms reply="${preview(result.content)}"`
    );
    return { ...result, modelUsed: env.AI_MODEL };
  } catch (err) {
    const errorType = err instanceof Error ? err.name : typeof err;
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(
      `[llmRouter] main model (${env.AI_MODEL}) failed after ${Date.now() - mainStart}ms ` +
      `(${errorType}: ${errorMessage}). Falling back to ${FALLBACK_MODEL}.`
    );

    const fallbackStart = Date.now();
    const result = await requestCompletion(FALLBACK_MODEL, messages, options, FALLBACK_MODEL_TIMEOUT_MS, false);
    console.log(
      `[llmRouter] model=${FALLBACK_MODEL} latency=${Date.now() - fallbackStart}ms ` +
      `reply="${preview(result.content)}" (fallback after main error: ${errorType})`
    );
    return { ...result, modelUsed: FALLBACK_MODEL };
  }
}
