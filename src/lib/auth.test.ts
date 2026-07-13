// Tests for: src/lib/auth.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiCall } from './auth';

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('lib/auth apiCall', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const result = await apiCall('/api/classes');
    expect(result).toEqual({ ok: true });
  });

  it('merges custom headers with the default Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock;

    await apiCall('/api/classes', { headers: { 'X-Custom': '1' } });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Custom': '1' });
  });

  it('redirects to /login and throws on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });

    await expect(apiCall('/api/classes')).rejects.toThrow('API error: 401');
    expect(locationStub.href).toBe('/login');
  });

  it('throws a generic error on other failures without redirecting', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });

    await expect(apiCall('/api/classes')).rejects.toThrow('API error: 500');
    expect(locationStub.href).toBe('');
  });
});
