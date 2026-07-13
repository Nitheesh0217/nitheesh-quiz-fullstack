// Tests for: src/app/forgot-password/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import ForgotPasswordPage from './page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('renders the form', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Reset your password')).toBeDefined();
    expect(screen.getByLabelText(/School Email Address/i)).toBeDefined();
  });

  it('shows a validation error toast for an invalid email', async () => {
    global.fetch = vi.fn();
    render(<ForgotPasswordPage />);

    fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));
    await waitFor(() => expect(screen.getByText('Invalid school email address')).toBeDefined());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the confirmation card on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'a@school.edu' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeDefined());
    expect(screen.getByText(/a@school.edu/)).toBeDefined();
  });

  it('shows a rate-limit error toast on a 429 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 429, json: async () => ({ error: 'Slow down' }) });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'a@school.edu' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(screen.getByText('Slow down')).toBeDefined());
  });

  it('shows a generic error toast when the request itself fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/School Email Address/i), { target: { value: 'a@school.edu' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/i }));

    await waitFor(() => expect(screen.getByText('network down')).toBeDefined());
  });
});
