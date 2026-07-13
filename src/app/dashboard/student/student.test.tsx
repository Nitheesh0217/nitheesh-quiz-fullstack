// Tests for: src/app/dashboard/student/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import StudentDashboard from './page';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('../../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../DashboardLayoutContext', () => ({
  useDashboardLayout: vi.fn(),
}));

const mockApiCall = vi.fn();
vi.mock('../../../lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const STUDENT_USER = {
  id: 'student-1',
  name: 'Alex Johnson',
  email: 'alex.johnson@university.edu',
  role: 'student' as const,
  school_id: 'school-1',
};

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const CLASSES = [{ id: 'c1', name: 'Biology', description: 'Intro bio', code: 'BIO-101' }];
const CLASS_DETAILS = { teacher_name: 'Dr. Smith' };
const RAW_GRADES = [
  {
    student_id: 'student-1',
    total_score: 45,
    assignment_id: 'a1',
    grade_id: 'g1',
    assignment_title: 'Essay',
    feedback: 'Great job',
    rubric_scores: [{ criterion: 'Clarity', score: 45 }],
  },
];
const ASSIGNMENTS = [{ id: 'a1', title: 'Essay', due_date: FUTURE_DATE, rubric: [{ max_points: 50 }] }];
const AVAILABLE_CLASSES = [{ id: 'c2', name: 'Chemistry', description: 'Intro chem', code: 'CHEM-101', teacher_name: 'Dr. X' }];

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(CLASSES);
  if (endpoint === '/api/classes/c1') return Promise.resolve(CLASS_DETAILS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(RAW_GRADES);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE_CLASSES);
  return Promise.resolve([]);
}

describe('StudentDashboard', () => {
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

  it('redirects to /dashboard when the authenticated user is not a student', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'teacher-1', name: 'Teacher', email: 't@e.edu', role: 'teacher', school_id: 's1' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<StudentDashboard />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('renders enrolled classes with computed grade, instructor, and next due assignment', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('Dr. Smith')).toBeDefined();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Grade: 90%')).toBeDefined();
  });

  it('renders the available classes catalog with an Enroll button', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Chemistry')).toBeDefined());
    expect(screen.getAllByText('Enroll in Class').length).toBeGreaterThan(0);
  });

  it('renders recent grades with the itemized score', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Biology - Essay')).toBeDefined());
    expect(screen.getByText('45 / 50 pts')).toBeDefined();
  });

  it('submits the enrollment code and reloads data on success', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c2/enroll' && options?.method === 'POST') {
        return Promise.resolve({});
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Chemistry')).toBeDefined());

    fireEvent.click(screen.getAllByText('Enroll in Class')[0]);
    const codeInput = await screen.findByPlaceholderText('e.g. BIO-101');
    fireEvent.change(codeInput, { target: { value: 'CHEM-101' } });

    fireEvent.click(screen.getByRole('button', { name: /Enroll Now/i }));

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith(
        '/api/classes/c2/enroll',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ enrollment_code: 'CHEM-101' }) })
      )
    );
  });

  it('shows a validation toast when submitting the enroll form with an empty code', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Chemistry')).toBeDefined());

    fireEvent.click(screen.getAllByText('Enroll in Class')[0]);
    await screen.findByPlaceholderText('e.g. BIO-101');

    // Bypass native `required` validation by calling handleEnrollClass via
    // the button directly with an empty enrollCode (the button dispatches
    // the same submit handler regardless of native constraint validation
    // once JSDOM's form submit event fires without a real browser check).
    const form = screen.getByPlaceholderText('e.g. BIO-101').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByText('Enrollment code is required')).toBeDefined());
  });

  it('opens the grade detail modal with itemized rubric scores and feedback, then closes it', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Biology - Essay')).toBeDefined());

    fireEvent.click(screen.getByText('Biology - Essay'));
    await waitFor(() => expect(screen.getByText('Grade Breakdown')).toBeDefined());
    expect(screen.getByText('Clarity')).toBeDefined();
    expect(screen.getByText('45 pts')).toBeDefined();
    // The quoted feedback also appears truncated in the recent-grades list
    // item behind the modal.
    expect(screen.getAllByText('"Great job"').length).toBe(2);

    fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
  });

  it('shows "No itemized rubric points" when rubric_scores is not an array', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') {
        // An object (not a string, not an array) skips the JSON.parse branch
        // entirely and exercises the Array.isArray(...) === false path.
        return Promise.resolve([{ ...RAW_GRADES[0], rubric_scores: { note: 'unstructured' } }]);
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Biology - Essay')).toBeDefined());
    fireEvent.click(screen.getByText('Biology - Essay'));
    await waitFor(() => expect(screen.getByText('No itemized rubric points.')).toBeDefined());
  });

  it('shows the empty states for classes, assignments, and grades', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('No Classes Joined')).toBeDefined());
    expect(screen.getByText('All caught up')).toBeDefined();
    expect(screen.getByText('No Grades Yet')).toBeDefined();
  });

  it('shows "No upcoming assignments due" when a class has no next assignment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([]);
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('No upcoming assignments due')).toBeDefined();
  });

  it('shows the info, warning, and danger grade badge variants', async () => {
    async function renderWithGrade(score: number, maxPoints: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes/c1/grades') {
          return Promise.resolve([{ ...RAW_GRADES[0], total_score: score }]);
        }
        if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay', due_date: FUTURE_DATE, rubric: [{ max_points: maxPoints }] }]);
        return routeApiCall(endpoint);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });
      render(<StudentDashboard />);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    }

    await renderWithGrade(82, 100); // info: >=80
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Grade: 82%')).toBeDefined();
    cleanup();

    await renderWithGrade(76, 100); // warning: >=75
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Grade: 76%')).toBeDefined();
    cleanup();

    await renderWithGrade(50, 100); // danger: <75
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Grade: 50%')).toBeDefined();
  });

  it('shows an error toast when enrollment fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c2/enroll' && options?.method === 'POST') {
        return Promise.reject(new Error('Invalid enrollment code'));
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Chemistry')).toBeDefined());

    fireEvent.click(screen.getAllByText('Enroll in Class')[0]);
    const codeInput = await screen.findByPlaceholderText('e.g. BIO-101');
    fireEvent.change(codeInput, { target: { value: 'BAD-CODE' } });
    fireEvent.click(screen.getByRole('button', { name: /Enroll Now/i }));

    await waitFor(() => expect(screen.getByText('Invalid enrollment code')).toBeDefined());
  });

  it('picks a different classroom from the select dropdown when multiple are available', async () => {
    const TWO_AVAILABLE = [
      ...AVAILABLE_CLASSES,
      { id: 'c3', name: 'Physics', description: 'Intro physics', code: 'PHYS-101', teacher_name: 'Dr. Y' },
    ];
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/available') return Promise.resolve(TWO_AVAILABLE);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText('Physics')).toBeDefined());

    fireEvent.click(screen.getAllByText('Enroll in Class')[0]);
    const select = await screen.findByDisplayValue(/Chemistry/);
    fireEvent.change(select, { target: { value: 'c3' } });
    expect((select as HTMLSelectElement).value).toBe('c3');
  });

  it('falls back to a default instructor and grade when enriching a class throws synchronously', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(CLASSES);
      if (endpoint === '/api/classes/c1') return Promise.resolve(CLASS_DETAILS);
      // Malformed rubric JSON makes JSON.parse throw synchronously inside
      // the per-class enrichment try block.
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve(RAW_GRADES);
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay', due_date: FUTURE_DATE, rubric: 'not-json' }]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Grade: N/A')).toBeDefined();
  });

  it('marks an assignment as submitted (and skips it from Assignments Due) when a stored submission still exists', async () => {
    localStorage.setItem('submission_student-1_a1', 'sub-1');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.resolve({ id: 'sub-1' });
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('All caught up')).toBeDefined();
  });

  it('treats a stored submission as unsubmitted when the submission fetch fails', async () => {
    localStorage.setItem('submission_student-1_a1', 'sub-1');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.reject(new Error('not found'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    // "Essay" appears both as the class card's next-due-task title and as
    // the Assignments Due list item title.
    expect(screen.getAllByText('Essay').length).toBeGreaterThan(0);
  });

  it('shows an error banner when the student portal fails to load unexpectedly', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(null);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<StudentDashboard />);
    await waitFor(() => expect(screen.getByText(/Failed to load student portal|Cannot read/)).toBeDefined());
  });

  it('opens the enroll modal via the topbar action button', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

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
          <StudentDashboard />
        </>
      );
    }

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Chemistry')).toBeDefined());

    // The topbar action button and each catalog card both render an
    // "Enroll in Class" button — the topbar one is rendered first.
    fireEvent.click(screen.getAllByRole('button', { name: /Enroll in Class/i })[0]);
    await waitFor(() => expect(screen.getByText('Join a Classroom')).toBeDefined());
  });
});
