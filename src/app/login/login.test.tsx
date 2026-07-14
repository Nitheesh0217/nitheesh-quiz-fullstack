// Tests for: src/app/login/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import LoginPage from './page';
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

describe('LoginPage', () => {
  beforeEach(() => {
    mockSearchParams.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
      hasRole: () => false,
    });
  });

  it('renders the sign-in form', () => {
    render(<LoginPage />);
    expect(screen.getByText('Welcome back')).toBeDefined();
    expect(screen.getByLabelText(/School Email Address/i)).toBeDefined();
    expect(screen.getByLabelText(/Password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeDefined();
  });

  it('shows a validation error toast and does not call fetch when submitting empty fields', async () => {
    global.fetch = vi.fn();
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(screen.getByText('Invalid school email address')).toBeDefined());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error toast when the API rejects the credentials', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'student@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeDefined());
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('logs in and redirects to the role-specific dashboard on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user_id: 'u1',
        email: 'teacher@school.edu',
        name: 'Ms. Teacher',
        role: 'teacher',
        school_id: 's1',
      }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'teacher@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({
      id: 'u1',
      email: 'teacher@school.edu',
      name: 'Ms. Teacher',
      role: 'teacher',
      school_id: 's1',
    }));
    expect(localStorage.getItem('user_role')).toBe('teacher');
  });

  it('logs in and redirects admins to /dashboard/admin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 'u2', email: 'admin@school.edu', name: 'Admin', role: 'admin', school_id: null }),
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'admin@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/admin');
    vi.useRealTimers();
  });

  it('logs in and redirects students to /dashboard/student', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 'u3', email: 'student@school.edu', name: 'Student', role: 'student', school_id: 's1' }),
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'student@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/student');
    vi.useRealTimers();
  });

  it('removes the oauth_error query param from the URL when the toast is closed', () => {
    window.history.pushState({}, '', '/login?oauth_error=access_denied');
    mockSearchParams.set('oauth_error', 'access_denied');
    render(<LoginPage />);

    expect(screen.getByText('Google authentication was cancelled.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(window.location.search).toBe('');
    window.history.pushState({}, '', '/login');
  });

  it('clears the toast without touching the URL when there is no oauth_error param', () => {
    window.history.pushState({}, '', '/login?toast=password-updated');
    mockSearchParams.set('toast', 'password-updated');
    render(<LoginPage />);

    expect(screen.getByText('Password updated successfully. Please sign in.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Password updated successfully. Please sign in.')).toBeNull();
    expect(window.location.search).toBe('?toast=password-updated');
    window.history.pushState({}, '', '/login');
  });

  it('shows a toast for a Google OAuth error passed via search params', () => {
    mockSearchParams.set('oauth_error', 'access_denied');
    render(<LoginPage />);
    expect(screen.getByText('Google authentication was cancelled.')).toBeDefined();
  });

  it('shows a success toast when redirected after a password update', () => {
    mockSearchParams.set('toast', 'password-updated');
    render(<LoginPage />);
    expect(screen.getByText('Password updated successfully. Please sign in.')).toBeDefined();
  });

  it('toggles password visibility', () => {
    render(<LoginPage />);
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
    fireEvent.click(screen.getByTitle('Show password'));
    expect(passwordInput.type).toBe('text');
  });

  it('shows a generic fallback toast for an unrecognized oauth_error value', () => {
    mockSearchParams.set('oauth_error', 'some_other_error');
    render(<LoginPage />);
    expect(screen.getByText('Google sign-in error: some_other_error')).toBeDefined();
  });

  it('falls back to a default message when the API rejects without an error field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'student@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeDefined());
  });

  it('shows a default failure toast when a non-Error value is thrown', async () => {
    global.fetch = vi.fn().mockRejectedValue('network exploded');

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'student@school.edu' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => expect(screen.getByText('Failed to sign in. Check your email/password.')).toBeDefined());
  });

  it('shows an inline validation error for an invalid email format once touched', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'not-an-email' } });
    expect(screen.getByText('Invalid school email address')).toBeDefined();
  });

  it('shows an inline validation error for a too-short password once touched', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'short' } });
    expect(screen.getByText('Password must be at least 8 characters long')).toBeDefined();
  });

  it('toggles the "Keep me signed in" checkbox', () => {
    render(<LoginPage />);
    const checkbox = screen.getByText('Keep me signed in').previousSibling as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
