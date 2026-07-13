// Tests for: src/app/register/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import RegisterPage from './page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
const mockSearchParams = new Map<string, string>();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => mockSearchParams.get(key) ?? null }),
}));

const SCHOOLS = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Concentrate Academy' }];

function mockFetchSequence(...responses: Array<{ ok: boolean; body: unknown }>) {
  const impl = vi.fn();
  for (const { ok, body } of responses) {
    impl.mockResolvedValueOnce({ ok, json: async () => body });
  }
  global.fetch = impl;
  return impl;
}

describe('RegisterPage', () => {
  beforeEach(() => {
    mockSearchParams.clear();
    localStorage.clear();
  });

  it('loads the schools catalog and renders the form', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);

    expect(screen.getByText('Create your account')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
  });

  it('defaults to the student role and switches to teacher when selected', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const teacherOption = screen.getByText('Teacher').closest('button')!;
    const studentOption = screen.getByText('Student').closest('button')!;

    expect(studentOption.className).toContain('border-primary');
    fireEvent.click(teacherOption);
    expect(teacherOption.className).toContain('border-primary');
  });

  it('shows a validation error toast when submitting with an empty name', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(screen.getByText('Full name is required')).toBeDefined());
  });

  it('shows the password strength meter as the password gets stronger', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const passwordInput = screen.getByPlaceholderText('Minimum 8 characters');
    // 8+ chars, no uppercase/digit/special => strength score 1 ("Weak")
    fireEvent.change(passwordInput, { target: { value: 'weakweak' } });
    expect(screen.getByText('❌ Weak password')).toBeDefined();

    fireEvent.change(passwordInput, { target: { value: 'Str0ng!Pass' } });
    expect(screen.getByText('✅ Strong password')).toBeDefined();
  });

  it('submits registration and redirects to the dashboard on success', async () => {
    const fetchMock = mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: true, body: { user_id: 'u2', role: 'student' } }
    );
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Student' } });
    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'new@school.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/register', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(localStorage.getItem('user_role')).toBe('student'));
  });

  it('shows an error toast when registration fails', async () => {
    mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: false, body: { error: 'Email already registered' } }
    );
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Student' } });
    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'new@school.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(screen.getByText('Email already registered')).toBeDefined());
  });

  it('shows a toast for a Google OAuth error passed via search params', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    mockSearchParams.set('oauth_error', 'oauth_failed');
    render(<RegisterPage />);
    expect(screen.getByText('Google sign-up failed. Please try again or use email/password.')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
  });

  it('silently ignores a network failure while loading the schools catalog', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<RegisterPage />);

    await waitFor(() => expect(console.error).toHaveBeenCalledWith('Failed to load schools catalog', expect.any(Error)));
    expect(screen.getByText('Create your account')).toBeDefined();
  });

  it('redirects to /dashboard after a successful registration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: true, body: { user_id: 'u2', role: 'student' } }
    );
    render(<RegisterPage />);
    await vi.waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Student' } });
    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'new@school.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await vi.waitFor(() => expect(screen.getByText('Account Created!')).toBeDefined());
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    vi.useRealTimers();
  });

  it('removes the oauth_error query param from the URL when the toast is closed', async () => {
    window.history.pushState({}, '', '/register?oauth_error=oauth_failed');
    mockFetchSequence({ ok: true, body: SCHOOLS });
    mockSearchParams.set('oauth_error', 'oauth_failed');
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(window.location.search).toBe('');
    window.history.pushState({}, '', '/register');
  });
});
