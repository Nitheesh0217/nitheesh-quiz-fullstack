export const API_URL = ''; // Proxied via next.config.mjs rewrites, so empty string targets same origin

export async function apiCall(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Export AuthProvider and useAuth to satisfy import paths from lib/auth
export { useAuth, AuthProvider } from '../components/AuthProvider';
export type { AuthUser } from '../components/AuthProvider';
