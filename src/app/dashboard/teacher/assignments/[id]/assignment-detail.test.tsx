// Tests for: src/app/dashboard/teacher/assignments/[id]/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import TeacherAssignmentDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
const mockUseParams = vi.fn<() => { id?: string }>(() => ({ id: 'assign-1' }));
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => mockUseParams(),
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../DashboardLayoutContext', () => ({
  useDashboardLayout: vi.fn(),
}));

const mockApiCall = vi.fn();
vi.mock('@/lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const TEACHER_USER = {
  id: 'teacher-1',
  name: 'Alice Thompson',
  email: 'alice.thompson@university.edu',
  role: 'teacher' as const,
  school_id: 'school-1',
};

function makeAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assign-1',
    class_id: 'class-1',
    title: 'Essay 1',
    description: 'Write a 500-word essay.',
    due_date: '2026-08-01T10:00:00.000Z',
    rubric: [
      { criterion: 'Clarity', max_points: 50 },
      { criterion: 'Grammar', max_points: 50 },
    ],
    ...overrides,
  };
}

const SUBMITTED_SUB = {
  id: 'sub-1',
  assignment_id: 'assign-1',
  student_id: 's1',
  student_name: 'Alex Johnson',
  student_email: 'alex@school.edu',
  file_url: null,
  text_content: 'My essay text.',
  status: 'submitted' as const,
  submitted_at: '2026-07-01T00:00:00.000Z',
};

const SUBMITTED_SUB_LATER = {
  id: 'sub-3',
  assignment_id: 'assign-1',
  student_id: 's3',
  student_name: 'Casey Reed',
  student_email: 'casey@school.edu',
  file_url: null,
  text_content: 'Later essay text.',
  status: 'submitted' as const,
  submitted_at: '2026-07-10T00:00:00.000Z',
};

const GRADED_SUB = {
  id: 'sub-2',
  assignment_id: 'assign-1',
  student_id: 's2',
  student_name: 'Jamie Lee',
  student_email: 'jamie@school.edu',
  file_url: null,
  text_content: 'My other essay.',
  status: 'graded' as const,
  submitted_at: '2026-07-05T00:00:00.000Z',
};

const GRADE_FOR_SUB2 = {
  id: 'g1',
  total_score: 90,
  feedback: 'Great work!',
  rubric_scores: JSON.stringify([
    { criterion: 'Clarity', score: 45 },
    { criterion: 'Grammar', score: 45 },
  ]),
};

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/assignments/assign-1') return Promise.resolve(makeAssignment());
  if (endpoint === '/api/assignments/assign-1/submissions') {
    return Promise.resolve([SUBMITTED_SUB, GRADED_SUB]);
  }
  if (endpoint === '/api/submissions/sub-2/grades') return Promise.resolve(GRADE_FOR_SUB2);
  return Promise.resolve({});
}

function mockAuthAndLayout(action: React.ReactNode = null, setAction: (a: React.ReactNode) => void = vi.fn()) {
  vi.mocked(useAuth).mockReturnValue({
    user: TEACHER_USER,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (r) => r === 'teacher',
  });
  vi.mocked(useDashboardLayout).mockReturnValue({
    title: '',
    setTitle: vi.fn(),
    breadcrumbs: [],
    setBreadcrumbs: vi.fn(),
    action,
    setAction,
    isFocusMode: false,
    setIsFocusMode: vi.fn(),
  });
}

// Captures the topbar action node (the "Edit Assignment" button) that the
// page renders via setAction() rather than in its own JSX tree, mirroring
// admin.test.tsx's ChromeHarness pattern.
function ChromeHarness() {
  const [action, setAction] = React.useState<React.ReactNode>(null);
  vi.mocked(useAuth).mockReturnValue({
    user: TEACHER_USER,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (r) => r === 'teacher',
  });
  vi.mocked(useDashboardLayout).mockReturnValue({
    title: '',
    setTitle: vi.fn(),
    breadcrumbs: [],
    setBreadcrumbs: vi.fn(),
    action,
    setAction,
    isFocusMode: false,
    setIsFocusMode: vi.fn(),
  });
  return (
    <>
      {action}
      <TeacherAssignmentDetailPage />
    </>
  );
}

describe('TeacherAssignmentDetailPage', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ id: 'assign-1' });
    mockAuthAndLayout();
  });

  it('shows a full-screen spinner and never loads when the route has no assignment id', () => {
    mockUseParams.mockReturnValue({});
    mockApiCall.mockImplementation(routeApiCall);

    const { container } = render(<TeacherAssignmentDetailPage />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(mockApiCall).not.toHaveBeenCalled();
  });

  it('shows "Assignment not found" and an error toast when the initial fetch fails', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') return Promise.reject(new Error('network error'));
      return routeApiCall(endpoint);
    });

    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Assignment not found')).toBeDefined());
    expect(screen.getByText('Failed to load assignment details')).toBeDefined();

    // The only button on screen in this branch is the toast's own dismiss control.
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.queryByText('Failed to load assignment details')).toBeNull());
  });

  it('renders nothing once loaded when there is no authenticated user', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });
    mockApiCall.mockImplementation(routeApiCall);

    const { container } = render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders the assignment header, rubric guide, and total max points', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<TeacherAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    expect(screen.getByText('Write a 500-word essay.')).toBeDefined();
    expect(screen.getByText(/Due Date:/)).toBeDefined();
    expect(screen.getByText('Clarity')).toBeDefined();
    expect(screen.getByText('Grammar')).toBeDefined();
    expect(screen.getAllByText('50 pts').length).toBe(2);
    expect(screen.getByText('Total Max Points')).toBeDefined();
    expect(screen.getByText('100 pts')).toBeDefined();
  });

  it('parses a stringified rubric returned by the API', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') {
        return Promise.resolve(makeAssignment({ rubric: JSON.stringify([{ criterion: 'Effort', max_points: 20 }]) }));
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Effort')).toBeDefined());
    // "20 pts" appears twice: once for the single criterion, once as the total.
    expect(screen.getAllByText('20 pts').length).toBe(2);
  });

  it('does not render a due date badge when the assignment has no due date', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') return Promise.resolve(makeAssignment({ due_date: null }));
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    expect(screen.queryByText(/Due Date:/)).toBeNull();
  });

  it('shows the empty submissions state', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('No student submissions received yet.')).toBeDefined());
    expect(screen.getByText('Submissions Roster (0)')).toBeDefined();
  });

  it('sorts submissions ungraded-first, then most-recent within the same status, with correct badges', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([SUBMITTED_SUB, GRADED_SUB, SUBMITTED_SUB_LATER]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Submissions Roster (3)')).toBeDefined());
    await waitFor(() => expect(screen.getByText('90 / 100 pts')).toBeDefined());

    const names = screen.getAllByText(/Alex Johnson|Casey Reed|Jamie Lee/).map((el) => el.textContent);
    // Ungraded (Casey - later, Alex - earlier) before graded (Jamie).
    expect(names).toEqual(['Casey Reed', 'Alex Johnson', 'Jamie Lee']);
    expect(screen.getAllByText('Needs Grading').length).toBe(2);
    expect(screen.getByText('Graded')).toBeDefined();
  });

  it('falls back to the original submission and still shows it as graded when the per-submission grade fetch fails', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2/grades') return Promise.reject(new Error('gone'));
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Jamie Lee')).toBeDefined());
    expect(screen.getByText('Graded')).toBeDefined();

    // Opening it falls into the "no valid grade" branch: scores default to
    // the rubric's max points rather than any (missing) recorded score.
    fireEvent.click(screen.getByText('Jamie Lee'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('50');
    expect(inputs[1].value).toBe('50');
  });

  it('opens the grading side sheet for an ungraded submission with rubric defaults, and closes it', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    expect(screen.getByText('My essay text.')).toBeDefined();
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('50');
    expect(inputs[1].value).toBe('50');
    expect(screen.getByText('A (100%)')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Grading Side Sheet')).toBeNull());
  });

  it('opens the grading side sheet directly via the "Grade" button on an ungraded row', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    fireEvent.click(screen.getByText('Grade'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    expect(screen.getAllByText('Alex Johnson').length).toBeGreaterThan(0);
  });

  it('pre-fills scores for a graded submission from an array-form rubric_scores, falling back to max points for unmatched criteria', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2/grades') {
        return Promise.resolve({
          id: 'g1',
          total_score: 40,
          feedback: 'Solid clarity.',
          // Array form, missing a "Grammar" entry entirely.
          rubric_scores: [{ criterion: 'Clarity', score: 40 }],
        });
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Jamie Lee')).toBeDefined());

    fireEvent.click(screen.getByText('Jamie Lee'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('40'); // matched
    expect(inputs[1].value).toBe('50'); // unmatched -> falls back to max_points
    expect((screen.getByPlaceholderText('Add scoring comments or guidelines...') as HTMLTextAreaElement).value).toBe(
      'Solid clarity.'
    );
  });

  it('pre-fills scores for a graded submission from an object-form rubric_scores via Object.entries, defaulting empty feedback', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2/grades') {
        return Promise.resolve({
          id: 'g1',
          total_score: 90,
          feedback: null, // falsy feedback -> setFeedback('') fallback branch
          rubric_scores: { Clarity: 45, Grammar: 45 },
        });
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Jamie Lee')).toBeDefined());

    fireEvent.click(screen.getByText('Jamie Lee'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[0].value).toBe('45');
    expect(inputs[1].value).toBe('45');
    expect((screen.getByPlaceholderText('Add scoring comments or guidelines...') as HTMLTextAreaElement).value).toBe('');
  });

  it('clamps rubric score input to the valid [0, max] range and treats non-numeric input as 0', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];

    fireEvent.change(inputs[0], { target: { value: '200' } });
    expect(inputs[0].value).toBe('50'); // clamped to max

    fireEvent.change(inputs[0], { target: { value: '-10' } });
    expect(inputs[0].value).toBe('0'); // clamped to min

    fireEvent.change(inputs[0], { target: { value: '' } });
    expect(inputs[0].value).toBe('0'); // NaN falls back to 0

    fireEvent.change(inputs[0], { target: { value: '30' } });
    expect(inputs[0].value).toBe('30');
  });

  it('computes letter grade and badge variant across the A/B/C/D/F thresholds', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') {
        return Promise.resolve(makeAssignment({ rubric: [{ criterion: 'Total', max_points: 100 }] }));
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());
    const input = screen.getByRole('spinbutton') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '95' } });
    let badge = screen.getByText('A (95%)');
    expect(badge.className).toMatch(/bg-green-100/);

    fireEvent.change(input, { target: { value: '82' } });
    badge = screen.getByText('B (82%)');
    expect(badge.className).toMatch(/bg-blue-100/);

    fireEvent.change(input, { target: { value: '72' } });
    badge = screen.getByText('C (72%)');
    expect(badge.className).toMatch(/bg-blue-100/);

    fireEvent.change(input, { target: { value: '65' } });
    badge = screen.getByText('D (65%)');
    expect(badge.className).toMatch(/bg-red-100/);

    fireEvent.change(input, { target: { value: '50' } });
    badge = screen.getByText('F (50%)');
    expect(badge.className).toMatch(/bg-red-100/);
  });

  it('shows 0%/F for an assignment with an empty rubric (avoids dividing by zero)', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') return Promise.resolve(makeAssignment({ rubric: [] }));
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());

    expect(screen.getByText('F (0%)')).toBeDefined();
    expect(screen.getByText('0 / 0 pts')).toBeDefined();
    expect(screen.queryAllByRole('spinbutton').length).toBe(0);
  });

  it('submits a grade successfully, toasts, updates the roster row, and closes the sheet', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/submissions/sub-1/grades' && options?.method === 'POST') {
        return Promise.resolve({ total_score: 95, feedback: 'Nice job!' });
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Add scoring comments or guidelines...'), {
      target: { value: 'Nice job!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Grade' }));

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith(
        '/api/submissions/sub-1/grades',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            rubric_scores: [
              { criterion: 'Clarity', score: 50 },
              { criterion: 'Grammar', score: 50 },
            ],
            feedback: 'Nice job!',
          }),
        })
      )
    );
    await waitFor(() => expect(screen.getByText('Grade posted successfully!')).toBeDefined());
    await waitFor(() => expect(screen.queryByText('Grading Side Sheet')).toBeNull());
    expect(screen.getByText('95 / 100 pts')).toBeDefined();
    expect(screen.getAllByText('Graded').length).toBe(2);

    // Dismiss the toast via its own close control.
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    await waitFor(() => expect(screen.queryByText('Grade posted successfully!')).toBeNull());
  });

  it('shows an error toast and keeps the sheet open when submitting a grade fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/submissions/sub-1/grades' && options?.method === 'POST') {
        return Promise.reject(new Error('Scores out of range'));
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Submit Grade' }));

    await waitFor(() => expect(screen.getByText('Scores out of range')).toBeDefined());
    expect(screen.getByText('Grading Side Sheet')).toBeDefined();
  });

  it('falls back to a generic message when submitting a grade fails with a non-Error rejection', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/submissions/sub-1/grades' && options?.method === 'POST') {
        return Promise.reject('boom');
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Grading Side Sheet')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Submit Grade' }));

    await waitFor(() => expect(screen.getByText('Failed to submit grade')).toBeDefined());
  });

  it('opens, validates, edits, and saves the assignment through the Edit Assignment modal', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/assignments/assign-1' && options?.method === 'PUT') {
        return Promise.resolve({ title: 'Essay 1 Revised', description: 'Updated instructions.', due_date: null });
      }
      return routeApiCall(endpoint);
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Edit Assignment/i }));
    await waitFor(() => expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined());

    const titleInput = screen.getByDisplayValue('Essay 1') as HTMLInputElement;
    expect(screen.getByDisplayValue('Write a 500-word essay.')).toBeDefined();

    // Clear the (required) title field and force a submit to reach the
    // component's own "Title is required" validation, bypassing jsdom's
    // native constraint validation on the empty required input.
    fireEvent.change(titleInput, { target: { value: '' } });
    fireEvent.submit(titleInput.closest('form')!);
    await waitFor(() => expect(screen.getByText('Title is required')).toBeDefined());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/assignments/assign-1', expect.objectContaining({ method: 'PUT' }));

    fireEvent.change(titleInput, { target: { value: 'Essay 1 Revised' } });
    // Clear the optional fields too, exercising the `|| null` fallbacks for
    // description/due_date on submit (they default to truthy values above).
    fireEvent.change(screen.getByPlaceholderText('Provide instructions here...'), { target: { value: '' } });
    fireEvent.change(document.getElementById('edit-due') as HTMLInputElement, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith(
        '/api/assignments/assign-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ title: 'Essay 1 Revised', description: null, due_date: null }),
        })
      )
    );
    await waitFor(() => expect(screen.getByText('Assignment updated successfully!')).toBeDefined());
    await waitFor(() => expect(screen.queryByText('Update the title, instructions, and deadline.')).toBeNull());
    // loadData() is re-invoked after a successful save.
    await waitFor(() =>
      expect(mockApiCall.mock.calls.filter((c) => c[0] === '/api/assignments/assign-1' && !c[1]).length).toBeGreaterThan(1)
    );
  });

  it('shows an error toast when saving the Edit Assignment modal fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/assignments/assign-1' && options?.method === 'PUT') {
        return Promise.reject(new Error('Update failed'));
      }
      return routeApiCall(endpoint);
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Edit Assignment/i }));
    await waitFor(() => expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByText('Update failed')).toBeDefined());
    expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined();
  });

  it('falls back to a generic message when saving the Edit Assignment modal fails with a non-Error rejection', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/assignments/assign-1' && options?.method === 'PUT') {
        return Promise.reject('boom');
      }
      return routeApiCall(endpoint);
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Edit Assignment/i }));
    await waitFor(() => expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByText('Failed to update assignment')).toBeDefined());
  });

  it('prefills the Edit Assignment modal with empty fields when the assignment has no description or due date', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1') {
        return Promise.resolve(makeAssignment({ description: null, due_date: null }));
      }
      return routeApiCall(endpoint);
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Edit Assignment/i }));
    await waitFor(() => expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined());

    expect((screen.getByPlaceholderText('Provide instructions here...') as HTMLTextAreaElement).value).toBe('');
    expect((document.getElementById('edit-due') as HTMLInputElement).value).toBe('');
  });

  it('cancels out of the Edit Assignment modal without saving', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Edit Assignment/i }));
    await waitFor(() => expect(screen.getByText('Update the title, instructions, and deadline.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Update the title, instructions, and deadline.')).toBeNull());
  });

  it('navigates back to the classroom when the back button is clicked', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Essay 1')).toBeDefined());

    fireEvent.click(screen.getByText('Back to Classroom'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher/classes/class-1');
  });

  it('shows plain submitted text when there is no file attachment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([{ ...SUBMITTED_SUB, text_content: 'Just text, no file.', file_url: null }]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('Just text, no file.')).toBeDefined());
  });

  it('shows "No text content submitted." when a submission has neither text nor a file', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([{ ...SUBMITTED_SUB, text_content: null, file_url: null }]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('No text content submitted.')).toBeDefined());
  });

  it('renders a downloadable non-image data: attachment with its parsed filename', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([
          { ...SUBMITTED_SUB, text_content: null, file_url: 'data:application/pdf;name=essay.pdf;base64,QUJD' },
        ]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('essay.pdf')).toBeDefined());
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('pdf • PostgreSQL File DB')).toBeDefined();

    fireEvent.click(screen.getByText('Download File'));
  });

  it('renders an inline image preview for a data: attachment with no name, using a fallback filename', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([
          { ...SUBMITTED_SUB, text_content: null, file_url: 'data:image/png;base64,AAAA' },
        ]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByAltText('submitted_document')).toBeDefined());
    expect(screen.getByText('png • PostgreSQL File DB')).toBeDefined();
  });

  it('falls back to "document" in the mime label when the data: mime type has no subtype', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([
          { ...SUBMITTED_SUB, text_content: null, file_url: 'data:text;name=notes.txt;base64,QUJD' },
        ]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('notes.txt')).toBeDefined());
    expect(screen.getByText('document • PostgreSQL File DB')).toBeDefined();
  });

  it('gracefully handles a malformed data: URL with no mime type or filename at all', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([{ ...SUBMITTED_SUB, text_content: null, file_url: 'data:' }]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText('submitted_document')).toBeDefined());
    expect(screen.getByText('document • PostgreSQL File DB')).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders an "Open attachment" link with a parsed filename for a non-data: URL', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([
          { ...SUBMITTED_SUB, text_content: null, file_url: 'https://files.example.com/uploads/report.docx' },
        ]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText(/Open attachment: report.docx/)).toBeDefined());
  });

  it('falls back to "Open Attachment" for a non-data: URL with no filename segment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/assign-1/submissions') {
        return Promise.resolve([
          { ...SUBMITTED_SUB, text_content: null, file_url: 'https://files.example.com/' },
        ]);
      }
      return routeApiCall(endpoint);
    });
    render(<TeacherAssignmentDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByText('Alex Johnson'));
    await waitFor(() => expect(screen.getByText(/Open attachment: Open Attachment/)).toBeDefined());
  });
});
