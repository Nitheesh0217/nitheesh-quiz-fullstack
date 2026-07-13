// Tests for: src/app/reset-password/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import ResetPasswordPage from './page';

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

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockSearchParams.clear();
    mockSearchParams.set('token', 'valid-token');
  });

  it('renders the form', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('Set a new password')).toBeDefined();
    expect(screen.getByLabelText('New Password')).toBeDefined();
    expect(screen.getByLabelText('Confirm New Password')).toBeDefined();
  });

  it('warns when the reset token is missing from the URL', () => {
    mockSearchParams.clear();
    render(<ResetPasswordPage />);
    expect(screen.getByText(/This link is missing its reset token/)).toBeDefined();
  });

  it('blocks submission with a missing token', async () => {
    mockSearchParams.clear();
    global.fetch = vi.fn();
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));

    await waitFor(() => expect(screen.getByText('This link is missing its reset token.')).toBeDefined());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows a validation error for a short password', async () => {
    render(<ResetPasswordPage />);
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
    await waitFor(() => expect(screen.getByText('Password must be at least 8 characters long')).toBeDefined());
  });

  it('shows an error when the passwords do not match', async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));
    await waitFor(() => expect(screen.getByText('Passwords do not match.')).toBeDefined());
  });

  it('shows the expired-link card on a 400 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));

    await waitFor(() => expect(screen.getByText('This link has expired.')).toBeDefined());
  });

  it('shows a generic error toast on a non-400 failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) });
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));

    await waitFor(() => expect(screen.getByText('Server error')).toBeDefined());
  });

  it('resets successfully and redirects to /login after a delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Update password/i }));

    await vi.waitFor(() => expect(screen.getByText('Password updated!')).toBeDefined());
    await vi.advanceTimersByTimeAsync(1200);
    expect(mockPush).toHaveBeenCalledWith('/login?toast=password-updated');
    vi.useRealTimers();
  });

  it('toggles password visibility for both fields', () => {
    render(<ResetPasswordPage />);
    const newPassword = screen.getByLabelText('New Password') as HTMLInputElement;
    const confirmPassword = screen.getByLabelText('Confirm New Password') as HTMLInputElement;
    expect(newPassword.type).toBe('password');
    expect(confirmPassword.type).toBe('password');

    fireEvent.click(screen.getByTitle('Show password'));
    expect(newPassword.type).toBe('text');
    expect(confirmPassword.type).toBe('text');
  });
});
