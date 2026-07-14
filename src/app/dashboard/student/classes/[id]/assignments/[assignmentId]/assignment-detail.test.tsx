// Tests for: src/app/dashboard/student/classes/[id]/assignments/[assignmentId]/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import StudentAssignmentDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'c1', assignmentId: 'a1' }),
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../../../DashboardLayoutContext', () => ({
  useDashboardLayout: vi.fn(),
}));

const mockApiCall = vi.fn();
vi.mock('@/lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const STUDENT = { id: 'student-1', email: 'a@b.edu', name: 'Alex', role: 'student' as const, school_id: null };

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const ASSIGNMENT = {
  id: 'a1',
  class_id: 'c1',
  title: 'Essay',
  description: 'Write a 500-word essay.',
  due_date: FUTURE,
  // stringified rubric exercises the JSON.parse branch
  rubric: JSON.stringify([{ criterion: 'Clarity', max_points: 50 }, { criterion: 'Grammar', max_points: 50 }]),
};

const GRADE_MATCH = {
  grade_id: 'g1',
  assignment_id: 'a1',
  student_id: 'student-1',
  total_score: 90,
  feedback: 'Great work overall.',
  graded_at: '2026-01-05T00:00:00Z',
  // stringified rubric_scores exercises the JSON.parse branch
  rubric_scores: JSON.stringify({ Clarity: 45, Grammar: 45 }),
  submission_id: 'sub-1',
};

const OTHER_STUDENT_GRADE = {
  grade_id: 'g-x',
  assignment_id: 'a1',
  student_id: 'student-2',
  total_score: 10,
  feedback: null,
  graded_at: '2026-01-01T00:00:00Z',
  rubric_scores: {},
  submission_id: 'sub-x',
};

const SUBMISSION_1 = {
  id: 'sub-1',
  assignment_id: 'a1',
  student_id: 'student-1',
  file_url: 'data:application/pdf;name=essay.pdf;base64,QUJD',
  text_content: 'My essay body text.',
  status: 'graded',
  submitted_at: '2026-01-04T00:00:00Z',
};

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/assignments/a1') return Promise.resolve({ ...ASSIGNMENT });
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve([GRADE_MATCH, OTHER_STUDENT_GRADE]);
  if (endpoint === '/api/submissions/sub-1') return Promise.resolve(SUBMISSION_1);
  return Promise.resolve([]);
}

function mockAuthAndLayout(user: typeof STUDENT | null = STUDENT) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
  vi.mocked(useDashboardLayout).mockReturnValue({
    title: '',
    setTitle: vi.fn(),
    breadcrumbs: [],
    setBreadcrumbs: vi.fn(),
    action: null,
    setAction: vi.fn(),
    isFocusMode: false,
    setIsFocusMode: vi.fn(),
  });
}

describe('StudentAssignmentDetailPage', () => {
  beforeEach(() => {
    mockAuthAndLayout();
  });

  it('renders the graded state with submission info, rubric, score, and feedback', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined());
    expect(screen.getByText('Write a 500-word essay.')).toBeDefined();
    expect(screen.getByText(/Due Date:/)).toBeDefined();
    expect(screen.getByText('Clarity')).toBeDefined();
    expect(screen.getByText('Grammar')).toBeDefined();
    expect(screen.getAllByText('50 pts').length).toBe(2);

    expect(screen.getByText('Graded')).toBeDefined();
    expect(screen.getByText(/Submitted on/)).toBeDefined();
    expect(screen.getByText('essay.pdf')).toBeDefined();
    expect(screen.getByText('My essay body text.')).toBeDefined();
    expect(screen.getByText('90 points')).toBeDefined();
    expect(screen.getByText('90%')).toBeDefined();
    expect(screen.getByText('"Great work overall."')).toBeDefined();
  });

  it('shows "No submission record (Graded manually)" and a dismissible error toast when a graded submission fails to load', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.reject(new Error('gone'));
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Graded')).toBeDefined());
    expect(screen.getByText('No submission record (Graded manually)')).toBeDefined();
    expect(screen.getByText('Failed to load assignment details')).toBeDefined();
    expect(console.error).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    await waitFor(() => expect(screen.queryByText('Failed to load assignment details')).toBeNull());
  });

  it('hides the Teacher Comments section when feedback is empty and parses a non-string rubric_scores object', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([{ ...GRADE_MATCH, feedback: null, rubric_scores: { Clarity: 45 } }]);
      }
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Graded')).toBeDefined());
    expect(screen.queryByText('Teacher Comments')).toBeNull();
  });

  it('shows the Submitted (ungraded) state with a Resubmit button, and toggling it shows and hides the overwrite banner', async () => {
    localStorage.setItem('submission_student-1_a1', 'sub-2');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      if (endpoint === '/api/submissions/sub-2') {
        return Promise.resolve({ id: 'sub-2', assignment_id: 'a1', student_id: 'student-1', file_url: 'https://files.example.com/uploads/quiz-answer.docx', text_content: 'My quiz answers here.', status: 'submitted', submitted_at: '2026-01-03T00:00:00Z' });
      }
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Submitted')).toBeDefined());
    expect(screen.getByText(/Open attachment: quiz-answer.docx/)).toBeDefined();
    expect(screen.getByText('My quiz answers here.')).toBeDefined();
    expect(screen.getByText('Waiting for instructor assessment...')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Resubmit' }));
    await waitFor(() => expect(screen.getByText('Resubmitting will overwrite your previous draft.')).toBeDefined());
    expect(screen.getByText('Submit Assignment')).toBeDefined();

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Resubmitting will overwrite your previous draft.')).toBeNull());
    expect(screen.getByText('Submitted')).toBeDefined();
  });

  it('hides the Resubmit button when an ungraded submission is already marked "graded"', async () => {
    localStorage.setItem('submission_student-1_a1', 'sub-3');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      if (endpoint === '/api/submissions/sub-3') {
        return Promise.resolve({ id: 'sub-3', assignment_id: 'a1', student_id: 'student-1', file_url: null, text_content: null, status: 'graded', submitted_at: '2026-01-03T00:00:00Z' });
      }
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Submitted')).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Resubmit' })).toBeNull();
  });

  it('shows the Start Submission form when nothing has been submitted, and submitting reloads to the Submitted state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let assignmentFetchCount = 0;
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      if (endpoint === '/api/assignments/a1/submit' && options?.method === 'POST') {
        return Promise.resolve({ id: 'sub-new', assignment_id: 'a1', student_id: 'student-1', file_url: null, text_content: 'My draft.', status: 'submitted', submitted_at: '2026-01-06T00:00:00Z' });
      }
      if (endpoint === '/api/assignments/a1') {
        assignmentFetchCount += 1;
        return Promise.resolve({ ...ASSIGNMENT });
      }
      if (endpoint === '/api/submissions/sub-new') {
        return Promise.resolve({ id: 'sub-new', assignment_id: 'a1', student_id: 'student-1', file_url: null, text_content: 'My draft.', status: 'submitted', submitted_at: '2026-01-06T00:00:00Z' });
      }
      return routeApiCall(endpoint);
    });

    render(<StudentAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Submit Assignment')).toBeDefined());

    fireEvent.click(screen.getByLabelText('Text Entry'));
    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), { target: { value: 'My draft.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Work' }));

    await vi.waitFor(() => expect(screen.getByText('Assignment submitted successfully!')).toBeDefined());
    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => expect(screen.queryByText('Submit Assignment')).toBeNull());
    expect(screen.getByText('Submitted')).toBeDefined();
    expect(assignmentFetchCount).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('shows "Assignment not found" and a dismissible error toast when the initial fetch fails', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1') return Promise.reject(new Error('network error'));
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Assignment not found')).toBeDefined());
    expect(screen.getByText('Failed to load assignment details')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    await waitFor(() => expect(screen.queryByText('Failed to load assignment details')).toBeNull());
  });

  it('fetches assignment data even when the user is momentarily null, and renders nothing once loaded', async () => {
    mockAuthAndLayout(null);
    mockApiCall.mockImplementation(routeApiCall);
    const { container } = render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(mockApiCall).toHaveBeenCalledWith('/api/assignments/a1'));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders an inline image preview and supports downloading a data: URL attachment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.resolve({ ...SUBMISSION_1, file_url: 'data:image/png;name=photo.png;base64,AAAA', text_content: null });
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByAltText('photo.png')).toBeDefined());
    fireEvent.click(screen.getByText('Download File'));
  });

  it('falls back to a generic file name and type for a data: URL with no name or mime type', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.resolve({ ...SUBMISSION_1, file_url: 'data:;base64,AAAA', text_content: null });
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('submitted_document')).toBeDefined());
    expect(screen.getByText(/document • PostgreSQL File DB/)).toBeDefined();
  });

  it('falls back to "Open Attachment" for a non-data URL with no filename segment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.resolve({ ...SUBMISSION_1, file_url: 'https://files.example.com/', text_content: null });
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText(/Open attachment: Open Attachment/)).toBeDefined());
  });

  it('omits the due date badge when the assignment has none, and parses an already-parsed (non-string) rubric', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1') {
        return Promise.resolve({ ...ASSIGNMENT, due_date: null, rubric: [{ criterion: 'Clarity', max_points: 50 }, { criterion: 'Grammar', max_points: 50 }] });
      }
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined());
    expect(screen.queryByText(/Due Date:/)).toBeNull();
  });

  it('renders "No instructions provided." when the assignment description is empty', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1') return Promise.resolve({ ...ASSIGNMENT, description: null });
      return routeApiCall(endpoint);
    });
    render(<StudentAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('No instructions provided.')).toBeDefined());
  });

  it('navigates back to the classroom from the back button', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined());

    fireEvent.click(screen.getByText('Back to Classroom'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/student/classes/c1');
  });
});
