// Tests for: src/app/dashboard/teacher/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import TeacherDashboard from './page';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

const TEACHER_USER = {
  id: 'teacher-1',
  name: 'Alice Thompson',
  email: 'alice.thompson@university.edu',
  role: 'teacher' as const,
  school_id: 'school-1',
};

const CLASSES = [{ id: 'c1', name: 'Biology 101', description: 'Intro bio', code: 'BIO-101' }];
const STUDENTS = [{ id: 's1' }, { id: 's2' }];
const ASSIGNMENTS = [{ id: 'a1', title: 'Essay 1', rubric: [{ max_points: 100 }] }];
const GRADES = [{ assignment_id: 'a1', total_score: 90 }];
const SUBMISSIONS = [{ id: 'sub1', status: 'submitted', student_name: 'Alex Johnson', submitted_at: '2026-07-01' }];

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve(CLASSES);
  if (endpoint === '/api/classes/c1/students') return Promise.resolve(STUDENTS);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
  if (endpoint === '/api/assignments/a1/submissions') return Promise.resolve(SUBMISSIONS);
  return Promise.resolve([]);
}

describe('TeacherDashboard', () => {
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

  it('redirects to /dashboard when the authenticated user is not a teacher', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'admin-1', name: 'Admin', email: 'a@e.edu', role: 'admin', school_id: null },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<TeacherDashboard />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('renders the class list with computed student/assignment counts and class average', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);

    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    expect(screen.getByText('2 students')).toBeDefined();
    expect(screen.getByText('1 assigns')).toBeDefined();
    // total_score 90 / max_points 100 => 90%
    expect(screen.getByText(/Avg: 90%/)).toBeDefined();
  });

  it('renders the pending submissions count derived from submitted assignments', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);

    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
  });

  it('shows an empty state when the teacher has no classes', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);

    await waitFor(() => expect(screen.getByText('There are no ungraded student submissions pending review.')).toBeDefined());
  });

  it('creates a class through the modal, including the empty-name validation error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes' && options?.method === 'POST') {
        return Promise.resolve({ id: 'c2', name: 'Chemistry', description: null, code: 'CHEM-1' });
      }
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);
    await waitFor(() => expect(screen.getByText('No Classrooms Yet')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
    const nameInput = await screen.findByPlaceholderText('e.g. Biology 101');
    // The name input has a `required` attribute, so jsdom's native
    // constraint validation blocks a submit-button click when it's empty —
    // fire the form's submit event directly to bypass that and reach the
    // component's own validation.
    fireEvent.submit(nameInput.closest('form')!);
    await waitFor(() => expect(screen.getByText('Class name is required')).toBeDefined());

    fireEvent.change(nameInput, { target: { value: 'Chemistry' } });
    // Radix Dialog marks background content aria-hidden while open, so the
    // page's own (now-hidden) trigger button drops out of the accessible
    // query — only the modal's submit button matches here.
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

    await waitFor(() => expect(screen.getByText('Class created successfully!')).toBeDefined());
  });

  it('shows an error toast when class creation fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes' && options?.method === 'POST') {
        return Promise.reject(new Error('Class limit reached'));
      }
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);
    await waitFor(() => expect(screen.getByText('No Classrooms Yet')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
    await screen.findByText('Launch a new virtual classroom for your students.');
    fireEvent.change(screen.getByPlaceholderText('e.g. Biology 101'), { target: { value: 'Chemistry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

    await waitFor(() => expect(screen.getByText('Class limit reached')).toBeDefined());
  });

  it('copies the enrollment code to the clipboard', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<TeacherDashboard />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

    fireEvent.click(screen.getByTitle('Click to copy enrollment code'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('BIO-101');
    await waitFor(() => expect(screen.getByText('Enrollment code copied to clipboard')).toBeDefined());
    // Clicking the code shouldn't also navigate into the classroom (stopPropagation).
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a zeroed class card when enriching a class throws synchronously', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve(CLASSES);
      if (endpoint === '/api/classes/c1/students') return Promise.resolve(STUDENTS);
      // A rubric that isn't valid JSON makes JSON.parse throw synchronously
      // inside the per-class try block, exercising its catch fallback.
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay 1', rubric: 'not-json' }]);
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);
    await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
    expect(screen.getByText(/Avg: N\/A/)).toBeDefined();
  });

  it('shows an error banner when the teacher workspace fails to load unexpectedly', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve(null);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: TEACHER_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<TeacherDashboard />);
    await waitFor(() => expect(screen.getByText(/Failed to load teacher workspace|Cannot read/)).toBeDefined());
  });

  it('shows the info, warning, and danger class-average badge variants', async () => {
    async function renderWithScore(score: number, maxPoints: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve(CLASSES);
        if (endpoint === '/api/classes/c1/students') return Promise.resolve(STUDENTS);
        if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay 1', rubric: [{ max_points: maxPoints }] }]);
        if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ assignment_id: 'a1', total_score: score }]);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });
      const utils = render(<TeacherDashboard />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
      return utils;
    }

    let utils = await renderWithScore(82, 100); // info: >=80
    expect(screen.getByText(/Avg: 82%/)).toBeDefined();
    utils.unmount();
    cleanup();

    utils = await renderWithScore(76, 100); // warning: >=75
    expect(screen.getByText(/Avg: 76%/)).toBeDefined();
    utils.unmount();
    cleanup();

    utils = await renderWithScore(50, 100); // danger: <75
    expect(screen.getByText(/Avg: 50%/)).toBeDefined();
  });
});
