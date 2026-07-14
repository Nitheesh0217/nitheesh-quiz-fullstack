// Tests for: src/app/dashboard/teacher/classes/[id]/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import TeacherClassDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
// A single stable object reference — an unstable router would re-trigger any
// effect that depends on `router`.
const mockRouter = { push: mockPush };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'c1' }),
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

const CLASSROOM = {
  id: 'c1',
  name: 'Biology 101',
  description: 'Intro to biology concepts and lab work.',
  code: 'BIO-101',
  syllabus_overview: null as string | null,
};

const STUDENTS = [
  { student_id: 's1', name: 'Alex Johnson', email: 'alex@school.edu' },
  { student_id: 's2', name: 'Jamie Lee', email: 'jamie@school.edu' },
];

const ASSIGNMENTS = [
  {
    id: 'a1',
    title: 'Essay 1',
    description: 'Write a 5-paragraph essay.',
    due_date: null as string | null,
    rubric: [
      { criterion: 'Completeness', max_points: 50 },
      { criterion: 'Accuracy', max_points: 50 },
    ],
  },
];

const GRADES = [
  {
    grade_id: 'g1',
    submission_id: 'sub1',
    assignment_id: 'a1',
    student_id: 's1',
    total_score: 90,
    feedback: 'Nice work',
    student_name: 'Alex Johnson',
    student_email: 'alex@school.edu',
    assignment_title: 'Essay 1',
    rubric_scores: JSON.stringify([
      { criterion: 'Completeness', score: 45 },
      { criterion: 'Accuracy', score: 45 },
    ]),
  },
];

const SYLLABUS_WEEKS = [
  {
    id: 'w1',
    week_number: 1,
    title: 'Intro Week',
    topics: 'Cell biology basics',
    readings: 'Chapter 1',
    video_links: ['https://video.example/lec1'],
    linked_assignment_id: 'a1',
  },
];

const ANNOUNCEMENTS = [
  {
    id: 'ann1',
    title: 'Welcome!',
    content: 'Welcome to Biology 101.',
    created_at: '2026-01-01T00:00:00Z',
    author_name: 'Alice Thompson',
  },
];

const SUBMISSIONS_A1 = [
  { id: 'sub1', status: 'graded', student_name: 'Alex Johnson', submitted_at: '2026-01-01T00:00:00Z' },
  { id: 'sub2', status: 'submitted', student_name: 'Jamie Lee', submitted_at: '2026-01-02T00:00:00Z' },
];

function routeApiCall(endpoint: string): Promise<unknown> {
  if (endpoint === '/api/classes/c1') return Promise.resolve(CLASSROOM);
  if (endpoint === '/api/classes/c1/students') return Promise.resolve(STUDENTS);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
  if (endpoint === '/api/assignments/a1/submissions') return Promise.resolve(SUBMISSIONS_A1);
  if (endpoint === '/api/classes/c1/syllabus-weeks') return Promise.resolve(SYLLABUS_WEEKS);
  if (endpoint === '/api/classes/c1/announcements') return Promise.resolve(ANNOUNCEMENTS);
  return Promise.resolve([]);
}

function mockAuth(overrides: Partial<{ name: string }> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: { ...TEACHER_USER, ...overrides },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (r) => r === 'teacher',
  });
}

// AdminDashboard-style harness: TeacherClassDetailPage sets its "Add
// Assignment" topbar button via setAction() rather than its own JSX tree.
// The plain vi.fn() mock used elsewhere discards it; this harness actually
// captures and renders it so it can be interacted with.
function ChromeHarness() {
  const [action, setAction] = React.useState<React.ReactNode>(null);
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
      <TeacherClassDetailPage />
    </>
  );
}

describe('TeacherClassDetailPage', () => {
  beforeEach(() => {
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
  });

  // ---------------------------------------------------------------------
  // Loading / guard states
  // ---------------------------------------------------------------------

  it('shows a full-screen spinner while the workspace is loading', () => {
    mockApiCall.mockImplementation(() => new Promise(() => {})); // never resolves
    mockAuth();

    const { container } = render(<TeacherClassDetailPage />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows "Classroom not found" (and no error banner) when the classroom fetch fails', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.reject(new Error('Not your class'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Classroom not found')).toBeDefined());
    expect(screen.queryByText('Not your class')).toBeNull();
  });

  it('renders nothing once loaded if there is no authenticated user', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    const { container } = render(<TeacherClassDetailPage />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  // ---------------------------------------------------------------------
  // Header / class info
  // ---------------------------------------------------------------------

  it('renders the classroom header with code, student count, and average', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    expect(screen.getByText(/Code: BIO-101/)).toBeDefined();
    expect(screen.getByText('2 students enrolled')).toBeDefined();
    expect(screen.getByText(/Average: 90%/)).toBeDefined();
  });

  it('uses a default max score when a grade no longer has a matching assignment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([{ ...GRADES[0], assignment_id: 'missing-assignment' }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);

    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    expect(screen.getByText(/Average: 90%/)).toBeDefined();
  });

  it('shows a "Read more"/"Read less" toggle only for long descriptions', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.resolve({ ...CLASSROOM, description: 'Short.' });
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Short.')).toBeDefined());
    expect(screen.queryByText('Read more')).toBeNull();
  });

  it('toggles a long description between clamped and expanded', async () => {
    const longDescription = 'A'.repeat(150);
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.resolve({ ...CLASSROOM, description: longDescription });
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Read more')).toBeDefined());
    fireEvent.click(screen.getByText('Read more'));
    expect(screen.getByText('Read less')).toBeDefined();
    fireEvent.click(screen.getByText('Read less'));
    expect(screen.getByText('Read more')).toBeDefined();
  });

  it('shows the default description text when none is set', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.resolve({ ...CLASSROOM, description: null });
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('No classroom description provided.')).toBeDefined());
  });

  it('edits class info: opens pre-filled, cancels without saving', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Edit class details'));
    const nameInput = screen.getByDisplayValue('Biology 101');
    fireEvent.change(nameInput, { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Biology 101')).toBeDefined();
    expect(screen.queryByText('Changed Name')).toBeNull();
  });

  it('edits class info: rejects an empty name without calling the API', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Edit class details'));
    const nameInput = screen.getByDisplayValue('Biology 101');
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Class name is required')).toBeDefined());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/classes/c1', expect.objectContaining({ method: 'PUT' }));
  });

  it('edits class info: saves successfully and updates the header', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1' && options?.method === 'PUT') {
        return Promise.resolve({ name: 'Biology 201', description: 'Updated description' });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Edit class details'));
    fireEvent.change(screen.getByDisplayValue('Biology 101'), { target: { value: 'Biology 201' } });
    fireEvent.change(screen.getByPlaceholderText('Class description'), { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Class details updated!')).toBeDefined());
    expect(screen.getByText('Biology 201')).toBeDefined();
    expect(screen.getByText('Updated description')).toBeDefined();
  });

  it('edits class info: defaults the description field to empty and saves a blank description as null', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1') {
        if (options?.method === 'PUT') return Promise.resolve({ name: 'Biology 101', description: null });
        return Promise.resolve({ ...CLASSROOM, description: null });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Edit class details'));
    // The description textarea defaults to '' (not "null") when the classroom has none.
    expect((screen.getByPlaceholderText('Class description') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith(
        '/api/classes/c1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Biology 101', description: null }) })
      )
    );
  });

  it('shows the generic fallback error message when updating class info rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1' && options?.method === 'PUT') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByTitle('Edit class details'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Failed to update class')).toBeDefined());
  });

  it('edits class info: shows an error toast when the save fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1' && options?.method === 'PUT') {
        return Promise.reject(new Error('Name already taken'));
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Edit class details'));
    fireEvent.change(screen.getByDisplayValue('Biology 101'), { target: { value: 'Biology 201' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Name already taken')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Enrollment code
  // ---------------------------------------------------------------------

  it('copies the enrollment code to the clipboard', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Click to copy enrollment code'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('BIO-101');
    await waitFor(() => expect(screen.getByText('Enrollment code copied to clipboard')).toBeDefined());

    // The toast itself can also be dismissed manually via its own close button.
    fireEvent.click(screen.getByText('✕'));
    await waitFor(() => expect(screen.queryByText('Enrollment code copied to clipboard')).toBeNull());
  });

  // ---------------------------------------------------------------------
  // Topbar action + Create Assignment modal
  // ---------------------------------------------------------------------

  it('opens the create-assignment modal from the topbar action and validates required fields', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');

    fireEvent.submit(screen.getByPlaceholderText('e.g. Shakespeare Essay').closest('form')!);
    await waitFor(() => expect(screen.getByText('Assignment title is required')).toBeDefined());
  });

  it('adds, edits, and removes rubric rows; blocks removing the last row', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');

    // Default two rows: Completeness, Accuracy.
    expect(screen.getByDisplayValue('Completeness')).toBeDefined();
    expect(screen.getByDisplayValue('Accuracy')).toBeDefined();

    fireEvent.click(screen.getByText('+ Add Criterion'));
    const criterionInputs = screen.getAllByPlaceholderText('Criterion Name');
    expect(criterionInputs.length).toBe(3);
    fireEvent.change(criterionInputs[2], { target: { value: 'Creativity' } });
    const pointsInputs = screen.getAllByPlaceholderText('Pts');
    // Clearing the points field makes parseInt('') NaN — code falls back to 0.
    fireEvent.change(pointsInputs[2], { target: { value: '' } });
    expect((pointsInputs[2] as HTMLInputElement).value).toBe('0');
    fireEvent.change(pointsInputs[2], { target: { value: '20' } });
    expect((pointsInputs[2] as HTMLInputElement).value).toBe('20');

    // Remove rows down to a single one, then confirm the guard blocks going to zero.
    // Each rubric row's remove (trash) button is the sole <button> alongside
    // its "Criterion Name" input's container.
    let rowContainers = screen.getAllByPlaceholderText('Criterion Name');
    const thirdRowRemove = rowContainers[2].parentElement!.querySelector('button')!;
    fireEvent.click(thirdRowRemove);
    expect(screen.getAllByPlaceholderText('Criterion Name').length).toBe(2);

    // Remove one more, down to a single row.
    rowContainers = screen.getAllByPlaceholderText('Criterion Name');
    const secondRowRemove = rowContainers[1].parentElement!.querySelector('button')!;
    fireEvent.click(secondRowRemove);
    expect(screen.getAllByPlaceholderText('Criterion Name').length).toBe(1);

    // Attempting to remove the last remaining row is a guarded no-op.
    rowContainers = screen.getAllByPlaceholderText('Criterion Name');
    const lastRemove = rowContainers[0].parentElement!.querySelector('button')!;
    expect((lastRemove as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(lastRemove);
    expect(screen.getAllByPlaceholderText('Criterion Name').length).toBe(1);
  });

  it('rejects assignment creation when a rubric row has a blank criterion or non-positive points', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Shakespeare Essay'), { target: { value: 'Pop Quiz' } });
    const criterionInputs = screen.getAllByPlaceholderText('Criterion Name');
    fireEvent.change(criterionInputs[0], { target: { value: '   ' } });

    fireEvent.submit(screen.getByPlaceholderText('e.g. Shakespeare Essay').closest('form')!);
    await waitFor(() =>
      expect(screen.getByText('Rubric criteria names must be valid, and max points must be positive')).toBeDefined()
    );
  });

  it('creates an assignment successfully and resets the form', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/assignments' && options?.method === 'POST') {
        return Promise.resolve({
          id: 'a2',
          title: 'Pop Quiz',
          description: null,
          due_date: null,
          rubric: [{ criterion: 'Completeness', max_points: 50 }, { criterion: 'Accuracy', max_points: 50 }],
        });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Shakespeare Essay'), { target: { value: 'Pop Quiz' } });
    fireEvent.change(screen.getByPlaceholderText('Provide instructions here...'), { target: { value: 'Answer all questions.' } });
    fireEvent.change(document.getElementById('assign-due') as HTMLInputElement, { target: { value: '2026-08-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Assignment' }));

    await waitFor(() => expect(screen.getByText('Assignment created successfully!')).toBeDefined());
    expect(screen.getByText('Pop Quiz')).toBeDefined();

    // Modal closed and form reset — reopening shows defaults again.
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');
    expect((screen.getByPlaceholderText('e.g. Shakespeare Essay') as HTMLInputElement).value).toBe('');
    expect(screen.getByDisplayValue('Completeness')).toBeDefined();
  });

  it('shows an error toast when assignment creation fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/assignments' && options?.method === 'POST') {
        return Promise.reject(new Error('Assignment limit reached'));
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');

    fireEvent.change(screen.getByPlaceholderText('e.g. Shakespeare Essay'), { target: { value: 'Pop Quiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Assignment' }));

    await waitFor(() => expect(screen.getByText('Assignment limit reached')).toBeDefined());
  });

  it('shows the generic fallback error message when assignment creation rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/assignments' && options?.method === 'POST') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Add Assignment/ }));
    await screen.findByText('Define rubric criteria and publish to your class.');
    fireEvent.change(screen.getByPlaceholderText('e.g. Shakespeare Essay'), { target: { value: 'Pop Quiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Assignment' }));

    await waitFor(() => expect(screen.getByText('Failed to create assignment')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Assignments list & pending submissions
  // ---------------------------------------------------------------------

  it('shows the empty assignments state and opens the modal from its own button', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('No Assignments')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Add Assignment' }));
    await screen.findByText('Define rubric criteria and publish to your class.');
  });

  it('shows an urgent due-date badge for assignments due within 72 hours, and none when there is no due date', async () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(); // 24h out
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ ...ASSIGNMENTS[0], due_date: soon }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    const badge = screen.getByText(/Due:/);
    expect(badge.className).toContain('animate-pulse');
  });

  it('shows a normal due-date badge for assignments due later than 72 hours out', async () => {
    const later = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(); // 10 days out
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ ...ASSIGNMENTS[0], due_date: later }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    const badge = screen.getByText(/Due:/);
    expect(badge.className).not.toContain('animate-pulse');
  });

  it('treats a past due date as not urgent', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ ...ASSIGNMENTS[0], due_date: past }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    const badge = screen.getByText(/Due:/);
    expect(badge.className).not.toContain('animate-pulse');
  });

  it('renders the graded-progress fraction and shows no due badge when due_date is null', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    expect(screen.getByText('1 / 2 graded')).toBeDefined();
    expect(screen.queryByText(/Due:/)).toBeNull();
  });

  it('navigates to the assignment page when its card is clicked', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    fireEvent.click(screen.getByRole('heading', { name: 'Essay 1' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher/assignments/a1');
  });

  it('deletes an assignment after confirmation without navigating (stopPropagation), and skips when cancelled', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/assignments/a1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    mockAuth();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle('Delete Assignment'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByTitle('Delete Assignment'));
    await waitFor(() => expect(screen.getByText('Assignment "Essay 1" deleted successfully.')).toBeDefined());
    expect(mockPush).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an error toast when assignment deletion fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/assignments/a1' && options?.method === 'DELETE') return Promise.reject(new Error('nope'));
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    fireEvent.click(screen.getByTitle('Delete Assignment'));
    await waitFor(() => expect(screen.getByText('Failed to delete assignment "Essay 1".')).toBeDefined());
  });

  it('shows the all-caught-up empty state when there are no pending submissions', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1/submissions') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('All caught up')).toBeDefined());
  });

  it('renders pending submissions and navigates to the grading page', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1/submissions') {
        return Promise.resolve([{ id: 'sub2', status: 'submitted', student_name: undefined, submitted_at: '2026-01-02T00:00:00Z' }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    // student_name fallback to 'Student' when missing.
    await waitFor(() => expect(screen.getByText('Student')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher/assignments/a1/grade');
  });

  // ---------------------------------------------------------------------
  // Roster tab
  // ---------------------------------------------------------------------

  it('shows an empty roster message when there are no students', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/students') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('No enrolled students.')).toBeDefined());
  });

  it('removes a student after confirmation, and skips when cancelled', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/students/s1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    mockAuth();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    // Roster is already the active tab by default; clicking it again still
    // exercises its onClick handler.
    fireEvent.click(screen.getByRole('button', { name: /Roster/ }));

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByLabelText('Remove Alex Johnson from class'));
    expect(screen.getByText('Alex Johnson')).toBeDefined();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByLabelText('Remove Alex Johnson from class'));
    await waitFor(() => expect(screen.getByText('Alex Johnson has been removed from the class.')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('shows an error toast when removing a student fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/students/s1' && options?.method === 'DELETE') return Promise.reject(new Error('nope'));
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Remove Alex Johnson from class'));
    await waitFor(() => expect(screen.getByText('Error: Could not remove Alex Johnson from class.')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Gradebook tab
  // ---------------------------------------------------------------------

  it('shows an empty grades message', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Gradebook/ }));
    expect(screen.getByText('No graded records.')).toBeDefined();
    expect(screen.getByText(/Average: N\/A/)).toBeDefined();
  });

  it('renders the gradebook, opens the grade detail sheet, and closes it', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Gradebook/ }));

    expect(screen.getByText('"Nice work"')).toBeDefined();
    fireEvent.click(screen.getByText('Alex Johnson'));

    await screen.findByText('Grade Detail Sheet');
    expect(screen.getByText('alex@school.edu')).toBeDefined();
    expect(screen.getByText('Completeness')).toBeDefined();
    // Both rubric criteria scored 45 pts.
    expect(screen.getAllByText('45 pts').length).toBe(2);
    expect(screen.getByText('90%')).toBeDefined();
    // Appears both in the (still-mounted) ledger row and the open detail sheet.
    expect(screen.getAllByText('"Nice work"').length).toBe(2);

    const sheet = document.querySelector('.animate-slideInRight') as HTMLElement;
    fireEvent.click(within(sheet).getAllByRole('button')[0]);
    await waitFor(() => expect(screen.queryByText('Grade Detail Sheet')).toBeNull());
  });

  it('shows the itemized-rubric fallback and omits feedback when absent', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([{ ...GRADES[0], feedback: null, rubric_scores: { not: 'an array' } }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Gradebook/ }));
    fireEvent.click(screen.getByText('Alex Johnson'));

    await screen.findByText('Grade Detail Sheet');
    expect(screen.getByText('No itemized rubric points scored.')).toBeDefined();
    expect(screen.queryByText('Feedback Comments')).toBeNull();
  });

  it('computes rubric max score from a JSON-string rubric and defaults to 100 when the assignment is missing', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ ...ASSIGNMENTS[0], rubric: JSON.stringify(ASSIGNMENTS[0].rubric) }]);
      }
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([
          { ...GRADES[0], grade_id: 'g1' },
          { ...GRADES[0], grade_id: 'g2', assignment_id: 'unknown-assignment', total_score: 40 },
        ]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Gradebook/ }));
    expect(screen.getAllByText('Alex Johnson').length).toBeGreaterThan(0);
    // Weighted average across (90/100) and (40/100) => 65%.
    expect(screen.getByText(/Average: 65%/)).toBeDefined();
  });

  it('keeps the class average at N/A when the aggregate rubric max is zero', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ ...ASSIGNMENTS[0], rubric: [{ criterion: 'x', max_points: 0 }] }]);
      }
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([{ ...GRADES[0], total_score: 0 }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    expect(screen.getByText(/Average: N\/A/)).toBeDefined();
  });

  it('shows the info, warning, and danger class-average variants', async () => {
    async function renderWithScore(score: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ ...GRADES[0], total_score: score }]);
        return routeApiCall(endpoint);
      });
      mockAuth();
      const utils = render(<TeacherClassDetailPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
      return utils;
    }

    let utils = await renderWithScore(82); // info: >=80
    expect(screen.getByText(/Average: 82%/)).toBeDefined();
    utils.unmount();
    cleanup();

    utils = await renderWithScore(75); // warning: >=70
    expect(screen.getByText(/Average: 75%/)).toBeDefined();
    utils.unmount();
    cleanup();

    utils = await renderWithScore(50); // danger: <70
    expect(screen.getByText(/Average: 50%/)).toBeDefined();
  });

  it('shows the info, warning, and danger score-variant badges in the detail sheet', async () => {
    async function renderWithScore(score: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ ...GRADES[0], total_score: score }]);
        return routeApiCall(endpoint);
      });
      mockAuth();
      render(<TeacherClassDetailPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: /Gradebook/ }));
      fireEvent.click(screen.getByText('Alex Johnson'));
      await screen.findByText('Grade Detail Sheet');
    }

    await renderWithScore(82); // info
    expect(screen.getByText('82%')).toBeDefined();
    cleanup();

    await renderWithScore(75); // warning
    expect(screen.getByText('75%')).toBeDefined();
    cleanup();

    await renderWithScore(50); // danger
    expect(screen.getByText('50%')).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // Syllabus tab
  // ---------------------------------------------------------------------

  it('shows the default course overview text and saves an edit', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-overview' && options?.method === 'PUT') {
        return Promise.resolve({ syllabus_overview: 'Late work loses 10%/day.' });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    expect(screen.getByText('No course overview added yet.')).toBeDefined();

    fireEvent.click(screen.getByTitle('Edit overview'));
    fireEvent.change(screen.getByPlaceholderText(/Textbook, grading policy/), {
      target: { value: 'Late work loses 10%/day.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Course overview saved!')).toBeDefined());
    expect(screen.getByText('Late work loses 10%/day.')).toBeDefined();
  });

  it('cancels editing the course overview without saving', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Edit overview'));
    fireEvent.change(screen.getByPlaceholderText(/Textbook, grading policy/), { target: { value: 'Draft text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('No course overview added yet.')).toBeDefined();
  });

  it('shows an error toast when saving the course overview fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-overview' && options?.method === 'PUT') {
        return Promise.reject(new Error('Overview save failed'));
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Edit overview'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Overview save failed')).toBeDefined());
  });

  it('shows the generic fallback error message when saving the course overview rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-overview' && options?.method === 'PUT') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Edit overview'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Failed to save overview')).toBeDefined());
  });

  it('adds a new syllabus week, sorted by week number, via the Add Week form', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-weeks' && options?.method === 'POST') {
        return Promise.resolve({
          id: 'w0',
          week_number: 0,
          title: 'Orientation',
          topics: '',
          readings: '',
          video_links: [],
          linked_assignment_id: null,
        });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Week/ }));

    await screen.findByRole('heading', { name: 'Add Syllabus Week' });
    // Defaults to weeks.length + 1.
    expect((screen.getByLabelText('Week #') as HTMLInputElement).value).toBe('2');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Orientation' } });
    fireEvent.change(screen.getByLabelText('Week #'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Week' }));

    await waitFor(() => expect(screen.getByText('Week added successfully!')).toBeDefined());
    // The new week (W0) should now sort before the existing W1.
    const headers = screen.getAllByText(/^W\d+$/);
    expect(headers[0].textContent).toBe('W0');
  });

  it('shows an error toast when creating a syllabus week fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-weeks' && options?.method === 'POST') {
        return Promise.reject(new Error('Week creation failed'));
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Week/ }));
    await screen.findByRole('heading', { name: 'Add Syllabus Week' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Orientation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Week' }));

    await waitFor(() => expect(screen.getByText('Week creation failed')).toBeDefined());
  });

  it('shows the generic fallback error message when saving a syllabus week rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-weeks' && options?.method === 'POST') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Week/ }));
    await screen.findByRole('heading', { name: 'Add Syllabus Week' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Orientation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Week' }));

    await waitFor(() => expect(screen.getByText('Failed to save week')).toBeDefined());
  });

  it('closes the syllabus week form via Cancel without submitting', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Week/ }));
    await screen.findByRole('heading', { name: 'Add Syllabus Week' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add Syllabus Week' })).toBeNull());
    expect(mockApiCall).not.toHaveBeenCalledWith(
      '/api/classes/c1/syllabus-weeks',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('edits an existing syllabus week (leaving sibling weeks untouched), pre-filled from its current values', async () => {
    const WEEK_TWO = { ...SYLLABUS_WEEKS[0], id: 'w2', week_number: 2, title: 'Week Two' };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/syllabus-weeks') return Promise.resolve([SYLLABUS_WEEKS[0], WEEK_TWO]);
      if (endpoint === '/api/syllabus-weeks/w1' && options?.method === 'PUT') {
        return Promise.resolve({ ...SYLLABUS_WEEKS[0], title: 'Intro Week (Updated)' });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    await screen.findByText('Week Two');

    // Toggling the (already-expanded, by default expandedWeek=1) week header collapses it.
    fireEvent.click(screen.getByText('Intro Week'));

    fireEvent.click(screen.getAllByTitle('Edit week')[0]);
    await screen.findByRole('heading', { name: 'Edit Week' });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Intro Week');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Intro Week (Updated)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Week' }));

    await waitFor(() => expect(screen.getByText('Week updated successfully!')).toBeDefined());
    expect(screen.getByText('Intro Week (Updated)')).toBeDefined();
    // The sibling week is untouched by the update.
    expect(screen.getByText('Week Two')).toBeDefined();
  });

  it('falls back to empty topics/readings when editing a week that has none set', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/syllabus-weeks') {
        return Promise.resolve([{ ...SYLLABUS_WEEKS[0], topics: null, readings: null }]);
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Edit week'));

    await screen.findByRole('heading', { name: 'Edit Week' });
    expect((screen.getByLabelText('Topics') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Readings') as HTMLInputElement).value).toBe('');
  });

  it('shows an error toast when updating a syllabus week fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/syllabus-weeks/w1' && options?.method === 'PUT') return Promise.reject(new Error('Update failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Edit week'));
    await screen.findByRole('heading', { name: 'Edit Week' });
    fireEvent.click(screen.getByRole('button', { name: 'Save Week' }));

    await waitFor(() => expect(screen.getByText('Update failed')).toBeDefined());
  });

  it('deletes a syllabus week after confirmation, and skips when cancelled', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/syllabus-weeks/w1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    mockAuth();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle('Delete week'));
    expect(screen.getByText('Intro Week')).toBeDefined();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByTitle('Delete week'));
    await waitFor(() => expect(screen.getByText('Week deleted.')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('shows an error toast when deleting a syllabus week fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/syllabus-weeks/w1' && options?.method === 'DELETE') return Promise.reject(new Error('Delete failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Delete week'));

    await waitFor(() => expect(screen.getByText('Delete failed')).toBeDefined());
  });

  it('shows the generic fallback error message when deleting a syllabus week rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/syllabus-weeks/w1' && options?.method === 'DELETE') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Syllabus' }));
    fireEvent.click(screen.getByTitle('Delete week'));

    await waitFor(() => expect(screen.getByText('Failed to delete week')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Announcements tab
  // ---------------------------------------------------------------------

  it('shows an empty announcements message and opens the Post Announcement form', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/announcements') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    expect(screen.getByText('No announcements posted.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
  });

  it('creates an announcement and prepends it to the list (author is stored as the current user)', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/announcements' && options?.method === 'POST') {
        return Promise.resolve({ id: 'ann2', title: 'Exam moved', content: 'The exam moved to Friday.', created_at: '2026-02-01T00:00:00Z' });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Exam moved' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'The exam moved to Friday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Announcement posted!')).toBeDefined());
    // The new announcement is prepended, appearing before the existing "Welcome!" one.
    const titles = screen.getAllByText(/^(Exam moved|Welcome!)$/).map((el) => el.textContent);
    expect(titles).toEqual(['Exam moved', 'Welcome!']);
  });

  it('falls back to storing "You" as the announcement author when the user has no name', async () => {
    // author_name isn't rendered anywhere in this page's UI, so this test
    // exercises the `user?.name || 'You'` fallback branch for coverage via
    // a user with an empty name; the visible outcome (toast + new entry) is
    // identical to the named-user case above.
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/announcements' && options?.method === 'POST') {
        return Promise.resolve({ id: 'ann2', title: 'Exam moved', content: 'Body', created_at: '2026-02-01T00:00:00Z' });
      }
      if (endpoint === '/api/classes/c1/announcements') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    mockAuth({ name: '' });

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Exam moved' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Body' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Announcement posted!')).toBeDefined());
    expect(screen.getByText('Exam moved')).toBeDefined();
  });

  it('shows an error toast when creating an announcement fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/announcements' && options?.method === 'POST') return Promise.reject(new Error('Post failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Post failed')).toBeDefined());
  });

  it('shows the generic fallback error message when posting an announcement rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/announcements' && options?.method === 'POST') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Failed to save announcement')).toBeDefined());
  });

  it('closes the announcement form via Cancel without submitting', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByRole('button', { name: /Post Announcement/ }));
    await screen.findByRole('heading', { name: 'Post Announcement' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Post Announcement' })).toBeNull());
    expect(mockApiCall).not.toHaveBeenCalledWith(
      '/api/classes/c1/announcements',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('edits an existing announcement (leaving sibling announcements untouched), pre-filled with its current values', async () => {
    const ANN_TWO = { ...ANNOUNCEMENTS[0], id: 'ann2', title: 'Second announcement' };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/announcements') return Promise.resolve([ANNOUNCEMENTS[0], ANN_TWO]);
      if (endpoint === '/api/announcements/ann1' && options?.method === 'PUT') {
        return Promise.resolve({ id: 'ann1', title: 'Welcome! (edited)', content: 'Welcome to Biology 101.' });
      }
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    await screen.findByText('Second announcement');
    fireEvent.click(screen.getAllByTitle('Edit announcement')[0]);

    await screen.findByRole('heading', { name: 'Edit Announcement' });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Welcome!');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Welcome! (edited)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Announcement updated!')).toBeDefined());
    expect(screen.getByText('Welcome! (edited)')).toBeDefined();
    // The sibling announcement is untouched by the update.
    expect(screen.getByText('Second announcement')).toBeDefined();
  });

  it('shows an error toast when updating an announcement fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/announcements/ann1' && options?.method === 'PUT') return Promise.reject(new Error('Update failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByTitle('Edit announcement'));
    await screen.findByRole('heading', { name: 'Edit Announcement' });
    fireEvent.click(screen.getByRole('button', { name: 'Post Announcement' }));

    await waitFor(() => expect(screen.getByText('Update failed')).toBeDefined());
  });

  it('deletes an announcement after confirmation, and skips when cancelled', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/announcements/ann1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    mockAuth();
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle('Delete announcement'));
    expect(screen.getByText('Welcome!')).toBeDefined();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByTitle('Delete announcement'));
    await waitFor(() => expect(screen.getByText('Announcement deleted.')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('shows an error toast when deleting an announcement fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/announcements/ann1' && options?.method === 'DELETE') return Promise.reject(new Error('Delete failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByTitle('Delete announcement'));

    await waitFor(() => expect(screen.getByText('Delete failed')).toBeDefined());
  });

  it('shows the generic fallback error message when deleting an announcement rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/announcements/ann1' && options?.method === 'DELETE') return Promise.reject('nope');
      return routeApiCall(endpoint);
    });
    mockAuth();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }));
    fireEvent.click(screen.getByTitle('Delete announcement'));

    await waitFor(() => expect(screen.getByText('Failed to delete announcement')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Workspace load error handling
  // ---------------------------------------------------------------------

  it('shows an error banner alongside the loaded content when a later fetch throws an Error', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.reject(new Error('Assignments fetch failed'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Assignments fetch failed')).toBeDefined());
    expect(screen.getByText('Biology 101')).toBeDefined();
  });

  it('shows the generic fallback error message when a later fetch rejects with a non-Error', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.reject('plain string rejection');
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Failed to load classroom details')).toBeDefined());
  });

  // ---------------------------------------------------------------------
  // Assignment enrichment edge branches
  // ---------------------------------------------------------------------

  it('defaults graded/submission counts to zero when the per-assignment submissions fetch rejects', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/assignments/a1/submissions') return Promise.reject(new Error('network error'));
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    expect(screen.getByText('0 / 2 graded')).toBeDefined();
    expect(screen.getByText('All caught up')).toBeDefined();
  });

  it('defaults graded/submission counts to zero when the submissions response has an unexpected shape', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      // Resolving (not rejecting) with a non-array bypasses the inline
      // `.catch(() => [])` and makes `subs.filter` throw synchronously,
      // exercising the enrichment's own try/catch fallback.
      if (endpoint === '/api/assignments/a1/submissions') return Promise.resolve(null);
      return routeApiCall(endpoint);
    });
    mockAuth();

    render(<TeacherClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay 1' })).toBeDefined());
    expect(screen.getByText('0 / 2 graded')).toBeDefined();
  });
});
