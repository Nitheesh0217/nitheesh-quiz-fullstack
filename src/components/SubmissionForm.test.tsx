// Tests for: src/components/SubmissionForm.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { SubmissionForm } from './SubmissionForm';
import { useAuth } from './AuthProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const mockApiCall = vi.fn();
vi.mock('../lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const STUDENT = { id: 'student-1', email: 'a@b.edu', name: 'Alex', role: 'student' as const, school_id: null };

function setup() {
  vi.mocked(useAuth).mockReturnValue({
    user: STUDENT,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
}

describe('SubmissionForm', () => {
  it('renders the file upload zone by default', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);
    expect(screen.getByText('Click to select or drag & drop file')).toBeDefined();
  });

  it('switches to the text entry mode and shows the character counter', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Text Entry'));
    const textarea = screen.getByPlaceholderText(/Type or paste/);
    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(screen.getByText('5 / 5000 chars')).toBeDefined();
  });

  it('rejects a file over 4MB with an error toast', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);

    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    const input = document.getElementById('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(screen.getByText('File must be less than 4MB')).toBeDefined();
  });

  it('accepts a valid file, shows its name, and allows removing it', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);

    const file = new File(['content'], 'essay.pdf', { type: 'application/pdf' });
    const input = document.getElementById('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getAllByText('essay.pdf').length).toBe(2);

    fireEvent.click(screen.getByTitle('Remove file'));
    expect(screen.getByText('Click to select or drag & drop file')).toBeDefined();
  });

  it('accepts a dropped file via drag and drop', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);

    const file = new File(['content'], 'dropped.pdf', { type: 'application/pdf' });
    const dropzone = screen.getByText('Click to select or drag & drop file').closest('div')!.parentElement!;

    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    // "dropped.pdf" appears both in the dropzone label and the file-info bar.
    expect(screen.getAllByText('dropped.pdf').length).toBe(2);
  });

  it('submits a text submission successfully and calls onSuccess after a delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup();
    mockApiCall.mockResolvedValue({ id: 'sub-1', file_url: null, text_content: 'hello', status: 'submitted', submitted_at: '2026-01-01' });
    const onSuccess = vi.fn();

    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={onSuccess} />);
    fireEvent.click(screen.getByLabelText('Text Entry'));
    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Work' }));

    await vi.waitFor(() => expect(screen.getByText('Assignment submitted successfully!')).toBeDefined());
    expect(localStorage.getItem('submission_student-1_a1')).toBe('sub-1');

    await vi.advanceTimersByTimeAsync(1000);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub-1' }));
    vi.useRealTimers();
  });

  it('submits a file submission successfully as a base64 data URL', async () => {
    setup();
    mockApiCall.mockResolvedValue({ id: 'sub-2', file_url: 'data:...', text_content: null, status: 'submitted', submitted_at: '2026-01-01' });

    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);
    const file = new File(['content'], 'essay.pdf', { type: 'application/pdf' });
    const input = document.getElementById('file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Submit Work' }));

    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith(
      '/api/assignments/a1/submit',
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(screen.getByText('Assignment submitted successfully!')).toBeDefined());
  });

  it('shows an error toast when submission fails', async () => {
    setup();
    mockApiCall.mockRejectedValue(new Error('Submission window closed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Text Entry'));
    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Work' }));

    await waitFor(() => expect(screen.getByText('Submission window closed')).toBeDefined());
  });

  it('disables the submit button until content is provided', () => {
    setup();
    render(<SubmissionForm assignmentId="a1" classId="c1" onSuccess={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Submit Work' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Text Entry'));
    expect((screen.getByRole('button', { name: 'Submit Work' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), { target: { value: 'hi' } });
    expect((screen.getByRole('button', { name: 'Submit Work' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
