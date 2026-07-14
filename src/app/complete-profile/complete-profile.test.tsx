// Tests for: src/app/complete-profile/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import CompleteProfilePage from './page';
import { useAuth } from '../../components/AuthProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogin = vi.fn();
vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const SCHOOLS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Concentrate Academy' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Other Academy' },
];

function mockFetchSequence(...responses: Array<{ ok: boolean; body: unknown }>) {
  const impl = vi.fn();
  for (const { ok, body } of responses) {
    impl.mockResolvedValueOnce({ ok, json: async () => body });
  }
  global.fetch = impl;
  return impl;
}

describe('CompleteProfilePage', () => {
  beforeEach(() => {
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
    render(<CompleteProfilePage />);

    expect(screen.getByText('Complete your profile')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
  });

  it('defaults to the student role and switches to teacher when selected', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const studentOption = screen.getByText('Student').closest('button')!;
    const teacherOption = screen.getByText('Teacher').closest('button')!;

    expect(studentOption.className).toContain('border-primary');
    fireEvent.click(teacherOption);
    expect(teacherOption.className).toContain('border-primary');
  });

  it('switches back to the student role after selecting teacher', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    const studentOption = screen.getByText('Student').closest('button')!;
    const teacherOption = screen.getByText('Teacher').closest('button')!;

    fireEvent.click(teacherOption);
    expect(teacherOption.className).toContain('border-primary');
    fireEvent.click(studentOption);
    expect(studentOption.className).toContain('border-primary');
  });

  it('changes the selected school via the dropdown', async () => {
    mockFetchSequence({ ok: true, body: SCHOOLS });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Other Academy')).toBeDefined());

    const select = screen.getByLabelText(/Select Your School/i) as HTMLSelectElement;
    expect(select.value).toBe(SCHOOLS[0].id);
    fireEvent.change(select, { target: { value: SCHOOLS[1].id } });
    expect(select.value).toBe(SCHOOLS[1].id);
  });

  it('silently ignores a network failure while loading the schools catalog', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<CompleteProfilePage />);

    await waitFor(() => expect(console.error).toHaveBeenCalledWith('Failed to load schools catalog', expect.any(Error)));
    expect(screen.getByText('Complete your profile')).toBeDefined();
  });

  it('does not populate a school selection when the schools request fails', async () => {
    mockFetchSequence({ ok: false, body: {} });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/schools'));

    const select = screen.getByLabelText(/Select Your School/i) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('shows a validation error toast when no valid school is selected', async () => {
    mockFetchSequence({ ok: true, body: [] });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/schools'));

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText('Please select a valid school')).toBeDefined());
  });

  it('submits the completed profile and redirects to the dashboard on success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: true, body: { user_id: 'u1', email: 'student@school.edu', name: 'New Student', role: 'student', school_id: SCHOOLS[0].id } }
    );
    render(<CompleteProfilePage />);
    await vi.waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/complete-profile', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'student', school_id: SCHOOLS[0].id }),
    }));

    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalledWith({
      id: 'u1',
      email: 'student@school.edu',
      name: 'New Student',
      role: 'student',
      school_id: SCHOOLS[0].id,
    }));
    await vi.waitFor(() => expect(screen.getByText("You’re all set!")).toBeDefined());

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    vi.useRealTimers();
  });

  it('shows an error toast when saving the profile fails', async () => {
    mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: false, body: { error: 'School is at capacity' } }
    );
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText('School is at capacity')).toBeDefined());
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('falls back to a default message when saving the profile fails without an error field', async () => {
    mockFetchSequence(
      { ok: true, body: SCHOOLS },
      { ok: false, body: {} }
    );
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText('Failed to save your profile')).toBeDefined());
  });

  it('dismisses the toast when the close button is clicked', async () => {
    mockFetchSequence({ ok: true, body: [] });
    render(<CompleteProfilePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/schools'));

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    await waitFor(() => expect(screen.getByText('Please select a valid school')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText('Please select a valid school')).toBeNull();
  });

  it('shows a default failure toast when a non-Error value is thrown while saving', async () => {
    const impl = vi.fn();
    impl.mockResolvedValueOnce({ ok: true, json: async () => SCHOOLS });
    impl.mockRejectedValueOnce('network exploded');
    global.fetch = impl;
    render(<CompleteProfilePage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText('Failed to save your profile')).toBeDefined());
  });
});
