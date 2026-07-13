// Tests for: src/components/AuthProvider.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthProvider';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiCall = vi.fn();
vi.mock('../lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Consumer() {
  const { user, isLoading, hasRole, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="user">{user ? user.name : 'none'}</div>
      <div data-testid="is-teacher">{String(hasRole('teacher'))}</div>
      <button onClick={() => login({ id: '1', email: 'a@b.com', name: 'Ada', role: 'teacher', school_id: 's1' })}>
        login
      </button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts in a loading state and resolves to no user when the session check fails', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('unauthenticated'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('populates the user from /api/auth/me on a successful session check', async () => {
    mockApiCall.mockResolvedValueOnce({
      user_id: 'u1',
      email: 'student@school.edu',
      name: 'Alex Johnson',
      role: 'student',
      school_id: 'school-1',
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Alex Johnson'));
  });

  it('falls back to userData.id when user_id is absent', async () => {
    mockApiCall.mockResolvedValueOnce({
      id: 'fallback-id',
      email: 'x@y.edu',
      name: 'Fallback User',
      role: 'admin',
      school_id: null,
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Fallback User'));
  });

  it('login() sets the user synchronously and hasRole reflects the new role', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('unauthenticated'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    act(() => {
      screen.getByText('login').click();
    });

    expect(screen.getByTestId('user').textContent).toBe('Ada');
    expect(screen.getByTestId('is-teacher').textContent).toBe('true');
  });

  it('logout() clears the user, clears localStorage, and redirects to /login even if the request fails', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('unauthenticated'));
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('network down'));
    localStorage.setItem('user_role', 'teacher');

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    act(() => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('user').textContent).toBe('Ada');

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(localStorage.getItem('user_role')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('logout() clears the user and redirects to /login when the request succeeds', async () => {
    mockApiCall.mockRejectedValueOnce(new Error('unauthenticated'));
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true });
    global.fetch = fetchMock;

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    act(() => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('user').textContent).toBe('Ada');

    await act(async () => {
      screen.getByText('logout').click();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('useAuth throws when used outside of an AuthProvider', () => {
    function Orphan() {
      useAuth();
      return null;
    }
    // Suppress the expected React error-boundary console.error noise for this assertion.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });
});
