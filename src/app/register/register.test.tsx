// Tests for: src/app/register/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import RegisterPage from './page';
import { useAuth } from '../../components/AuthProvider';

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

const mockLogin = vi.fn();
vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
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
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
      hasRole: () => false,
    });
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

  it('shows a generic fallback toast for an unrecognized oauth_error value', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    mockSearchParams.set('oauth_error', 'some_other_error');
    render(<RegisterPage />);
    expect(screen.getByText('Google sign-up error: some_other_error')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
  });

  it('falls back to a default message when registration fails without an error field', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS }, { ok: false, body: {} });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Student' } });
    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'new@school.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(screen.getByText('Failed to create account')).toBeDefined());
  });

  it('shows a default failure toast when a non-Error value is thrown during registration', async () => {
    const impl = vi.fn();
    impl.mockResolvedValueOnce({ ok: true, json: async () => SCHOOLS });
    impl.mockRejectedValueOnce('network exploded');
    global.fetch = impl;
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'New Student' } });
    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'new@school.edu' } });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(screen.getByText('Failed to register account')).toBeDefined());
  });

  it('shows an inline validation error for an invalid email format once touched', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('name@school.edu'), { target: { value: 'not-an-email' } });
    expect(screen.getByText('Invalid school email address')).toBeDefined();
  });

  it('shows an inline validation error for a too-short password and toggles visibility', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const passwordInput = screen.getByPlaceholderText('Minimum 8 characters') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    expect(screen.getByText('Password must be at least 8 characters long')).toBeDefined();

    expect(passwordInput.type).toBe('password');
    fireEvent.click(screen.getByTitle('Show password'));
    expect(passwordInput.type).toBe('text');
  });

  it('shows the "Good password" strength tier for a 3-criteria password', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    // 8+ chars, uppercase, digit, no special char => strength score 3 ("Good")
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'Password1' } });
    expect(screen.getByText('✨ Good password')).toBeDefined();
  });

  it('changes the selected school via the dropdown', async () => {
    const schools = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Concentrate Academy' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Other Academy' },
    ];
    mockFetchSequence({ ok: true, body: schools });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Other Academy')).toBeDefined());

    const select = screen.getByLabelText(/Select Your School/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: schools[1].id } });
    expect(select.value).toBe(schools[1].id);
  });

  it('switches back to the student role after selecting teacher', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<RegisterPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const teacherOption = screen.getByText('Teacher').closest('button')!;
    const studentOption = screen.getByText('Student').closest('button')!;

    fireEvent.click(teacherOption);
    expect(teacherOption.className).toContain('border-primary');
    fireEvent.click(studentOption);
    expect(studentOption.className).toContain('border-primary');
  });

  // Note: the "Full name is required" inline error branch (nameTouched && !nameValidation.success)
  // is unreachable through the UI: nameTouched is `name.length > 0`, and the schema's
  // `z.string().min(1)` succeeds for any string with length > 0, so the two conditions can never
  // disagree. Confirmed dead branch, left uncovered intentionally rather than changing behavior.
});
