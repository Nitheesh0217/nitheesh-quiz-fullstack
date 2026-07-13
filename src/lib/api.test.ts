// Tests for: src/lib/api.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCall } from './api';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('apiCall', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a successful response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await apiCall('/api/classes');

    expect(result).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/classes',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('does not set a Content-Type header when there is no request body', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({}));

    await apiCall('/api/classes', { method: 'DELETE' });

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    expect((options?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when a request body is present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({}));

    await apiCall('/api/classes', { method: 'POST', body: JSON.stringify({ name: 'x' }) });

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    expect((options?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns null for a 204 No Content response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse(null, 204));

    const result = await apiCall('/api/submissions/1');

    expect(result).toBeNull();
  });

  it('throws the server-provided error message on a non-401 failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ error: 'Invalid enrollment code' }, 400));

    await expect(apiCall('/api/classes/1/enroll', { method: 'POST' })).rejects.toThrow(
      'Invalid enrollment code'
    );
  });

  it('falls back to a generic message when the error response body is not JSON', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(apiCall('/api/classes')).rejects.toThrow('API error: 500');
  });

  it('retries once after a successful token refresh on 401, returning the retried result', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({}, 401)) // initial call
      .mockResolvedValueOnce(jsonResponse({ ok: true })) // /api/auth/refresh
      .mockResolvedValueOnce(jsonResponse({ data: 'retried' })); // retried call

    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, pathname: '/dashboard', href: '' },
      writable: true,
    });

    const result = await apiCall('/api/classes');

    expect(result).toEqual({ data: 'retried' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('redirects to /login when refresh fails and the current path is not public', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({}, 401)) // initial call
      .mockResolvedValueOnce(jsonResponse({}, 401)); // /api/auth/refresh fails

    const locationStub = { ...originalLocation, pathname: '/dashboard', href: '' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });

    const result = await apiCall('/api/classes');

    expect(result).toBeUndefined();
    expect(locationStub.href).toBe('/login');
  });

  it('does not redirect on a 401 from a public path (e.g. /login itself)', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({}, 401)) // initial call
      .mockResolvedValueOnce(jsonResponse({}, 401)); // /api/auth/refresh fails

    const locationStub = { ...originalLocation, pathname: '/login', href: 'http://localhost/login' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });

    const result = await apiCall('/api/auth/me');

    expect(result).toBeUndefined();
    expect(locationStub.href).toBe('http://localhost/login');
  });
});
