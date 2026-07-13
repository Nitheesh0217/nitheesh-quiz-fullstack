const API_URL = process.env.NEXT_PUBLIC_API_URL || ''; // Proxied via next.config.mjs rewrites, so empty string targets same origin

// Access tokens are short-lived (JWT_ACCESS_TTL, 15m by default) and nothing
// else in the app calls /api/auth/refresh. Without this, any session active
// longer than the token TTL starts failing every request with a 401 that
// looks like an action-specific error (e.g. "Could not remove student")
// instead of what it actually is: an expired session.
let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiCall(endpoint: string, options?: RequestInit, isRetry = false) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      // Only default to JSON when there's actually a body — Fastify rejects
      // bodyless requests (e.g. DELETE with no payload) that carry a JSON
      // content-type with FST_ERR_CTP_EMPTY_JSON_BODY.
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (!isRetry && (await refreshAccessToken())) {
        return apiCall(endpoint, options, true);
      }
      // Only redirect from pages that actually require a session. Without
      // this guard, an unauthenticated visit to /login itself (checkSession
      // gets a 401, refresh also 401s since there's no refresh token yet)
      // would repeatedly re-navigate to /login, causing an infinite reload
      // loop that wipes out the login form before a user can even submit it.
      // /forgot-password and /reset-password are equally public - their
      // entire audience is signed-out users, so they need the same guard.
      const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
      if (typeof window !== 'undefined' && !publicPaths.some((path) => window.location.pathname.startsWith(path))) {
        window.location.href = '/login';
      }
      return;
    }

    // Backend errors are always JSON ({ error, code, details? }) — surface
    // the actual message instead of a bare status code so the UI can show
    // the real reason (e.g. "Invalid enrollment code") instead of "API
    // error: 400".
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Response wasn't JSON — fall back to the generic status message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
