import { describe, it, expect, vi, afterEach } from 'vitest';
import { callChatCompletionWithFallback } from './llmRouter';
import { env } from '../env';

function jsonOkResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('llmRouter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies default temperature/top_p/max_tokens and omits tools/chat_template_kwargs when not provided', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonOkResponse({ choices: [{ message: { content: 'ok', tool_calls: [] } }] })
    );

    const result = await callChatCompletionWithFallback([{ role: 'user', content: 'hi' }], {});

    expect(result.content).toBe('ok');
    expect(result.modelUsed).toBe(env.AI_MODEL);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.7);
    expect(body.max_tokens).toBe(1024);
    expect(body.tools).toBeUndefined();
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it('truncates long replies in the log preview', async () => {
    const longReply = 'x'.repeat(120);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonOkResponse({ choices: [{ message: { content: longReply, tool_calls: [] } }] })
    );

    await callChatCompletionWithFallback([{ role: 'user', content: 'hi' }], {});

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`${'x'.repeat(80)}…`));
    consoleLogSpy.mockRestore();
  });

  it('falls back and logs a non-Error rejection type/message correctly', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    vi.spyOn(global, 'fetch')
      .mockImplementationOnce(async () => {
        throw 'boom';
      })
      .mockImplementationOnce(async () =>
        jsonOkResponse({ choices: [{ message: { content: 'fallback reply', tool_calls: [] } }] })
      );

    const result = await callChatCompletionWithFallback([{ role: 'user', content: 'hi' }], {});

    expect(result.content).toBe('fallback reply');
    expect(result.modelUsed).toBe('mistralai/mistral-medium-3.5-128b');
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('string: boom'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('fallback after main error: string'));

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('throws when both the main and fallback calls fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as any);

    await expect(
      callChatCompletionWithFallback([{ role: 'user', content: 'hi' }], {})
    ).rejects.toThrow('AI API returned status 500');
  });
});
