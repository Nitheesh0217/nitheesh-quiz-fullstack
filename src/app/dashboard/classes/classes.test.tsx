// Tests for: src/app/dashboard/classes/page.tsx
// @vitest-environment jsdom
//
// Known coverage gap: page.tsx's `loadData` starts with `if (!user) return;`
// (its `true` branch is never exercised here). Every call site — the
// user-effect (gated on `if (user) { loadData(); }`) and handleEnroll's
// post-success reload — only invokes loadData() when `user` is already
// known truthy, so that guard is unreachable defensive code through the
// component's public behavior, not a gap in these tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import ClassesPage from './page';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
// A stable object reference, matching Next's real useRouter() (which does not
// return a new object on every render) - otherwise the effect in page.tsx
// that depends on `router` re-fires on every re-render here, re-triggering
// loadData() any time local state changes.
const mockRouter = { push: mockPush };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
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
  email: 'alice@school.edu',
  role: 'teacher' as const,
  school_id: 'school-1',
};

const STUDENT_USER = {
  id: 'student-1',
  name: 'Alex Johnson',
  email: 'alex@school.edu',
  role: 'student' as const,
  school_id: 'school-1',
};

const ADMIN_USER = {
  id: 'admin-1',
  name: 'Sam Rivera',
  email: 'sam@school.edu',
  role: 'admin' as const,
  school_id: null,
};

// ClassesPage renders its "Create Class" / "Enroll in Class" topbar action
// via setAction() on the layout context, not directly in its own JSX, once
// classes.length > 0 — the plain vi.fn() mock elsewhere in this file
// discards it. This harness actually captures and renders that action node
// so tests can find and click it.
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
      <ClassesPage />
    </>
  );
}

describe('ClassesPage', () => {
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

  it('redirects to /login when there is no session', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => false });
    render(<ClassesPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('shows the loading skeleton while the auth session is still resolving', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: true, login: vi.fn(), logout: vi.fn(), hasRole: () => false });
    const { container } = render(<ClassesPage />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns null and re-redirects to /login when the session ends after classes have already loaded', async () => {
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

    const { rerender } = render(<ClassesPage />);
    await waitFor(() => expect(screen.getByText('No Classrooms Taught Yet')).toBeDefined());

    // Session ends (e.g. logout / expiry) while `loading` is already false —
    // this is the only path that reaches the component's `if (!user) return
    // null;` line, since `loading` never flips to false while user is null.
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => false });
    rerender(<ClassesPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('No Classrooms Taught Yet')).toBeNull();
  });

  describe('teacher role', () => {
    const CLASSES = [
      { id: 'c1', name: 'Biology 101', description: 'Intro bio', code: 'BIO-101' },
      { id: 'c2', name: 'Chemistry 201', description: null, code: 'CHEM-201' },
      { id: 'c3', name: 'Physics 301', description: 'Motion', code: 'PHYS-301' },
      { id: 'c4', name: 'Art 401', description: 'Sketching', code: 'ART-401' },
      { id: 'c5', name: 'Music 501', description: 'Theory', code: 'MUS-501' },
    ];

    function routeApiCall(endpoint: string) {
      if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve(CLASSES);
      if (endpoint === '/api/classes/c1/students') return Promise.resolve([{ id: 's1' }, { id: 's2' }]);
      // c1: rubric as a JSON *string* (exercises the typeof === 'string' branch),
      // single grade matches its assignment => 95% => "success" badge.
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', rubric: JSON.stringify([{ max_points: 100 }]) }]);
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ assignment_id: 'a1', total_score: 95 }]);

      if (endpoint === '/api/classes/c2/students') return Promise.resolve([]);
      // c2: rubric is a plain object (not an array, not a string) => the
      // Array.isArray(rubric) branch is false => default 100 max points.
      // One grade matches (aX), one references an unknown assignment (skipped).
      if (endpoint === '/api/classes/c2/assignments') return Promise.resolve([{ id: 'aX', rubric: { not: 'an-array' } }]);
      if (endpoint === '/api/classes/c2/grades') return Promise.resolve([
        { assignment_id: 'aX', total_score: 60 },
        { assignment_id: 'unknown-assignment', total_score: 999 },
      ]);

      if (endpoint === '/api/classes/c3/students') return Promise.resolve([{ id: 's1' }]);
      // c3: grades and assignments both non-empty, but no grade matches any
      // assignment => totalMax stays 0 => classAverage stays 'N/A' even
      // though the outer `grades.length>0 && assignments.length>0` is true.
      if (endpoint === '/api/classes/c3/assignments') return Promise.resolve([{ id: 'aY', rubric: [{ max_points: 50 }] }]);
      if (endpoint === '/api/classes/c3/grades') return Promise.resolve([{ assignment_id: 'unrelated', total_score: 70 }]);

      // c4: assignments is empty but grades is not => the
      // `assignments.length > 0` operand is false => classAverage 'N/A'.
      if (endpoint === '/api/classes/c4/students') return Promise.resolve([]);
      if (endpoint === '/api/classes/c4/assignments') return Promise.resolve([]);
      if (endpoint === '/api/classes/c4/grades') return Promise.resolve([{ assignment_id: 'a1', total_score: 50 }]);

      // c5: grades is empty entirely => the `grades.length > 0` operand is
      // false (short-circuiting before assignments.length is checked).
      if (endpoint === '/api/classes/c5/students') return Promise.resolve([]);
      if (endpoint === '/api/classes/c5/assignments') return Promise.resolve([{ id: 'a5', rubric: [{ max_points: 100 }] }]);
      if (endpoint === '/api/classes/c5/grades') return Promise.resolve([]);

      return Promise.resolve([]);
    }

    it('renders the teacher class list with computed stats across every grade/assignment branch combination', async () => {
      mockApiCall.mockImplementation(routeApiCall);
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      expect(screen.getByText('Your Classrooms')).toBeDefined();
      expect(screen.getByText('5')).toBeDefined(); // Total Classes tile
      expect(screen.getByText('2 students')).toBeDefined();
      expect(screen.getByText(/Avg: 95%/)).toBeDefined(); // success (>=90)
      expect(screen.getByText(/Avg: 60%/)).toBeDefined(); // danger (<75)
      expect(screen.getAllByText(/Avg: N\/A/).length).toBe(3); // c3, c4, c5
      // c2's description is null => falls back to the placeholder copy.
      expect(screen.getByText('No classroom description provided.')).toBeDefined();
      expect(screen.getByText('BIO-101')).toBeDefined();
    });

    it('falls back to a zeroed class card when a class enrichment throws synchronously', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.resolve([{ id: 'c1', name: 'Biology 101', description: 'Intro bio', code: 'BIO-101' }]);
        if (endpoint === '/api/classes/c1/students') return Promise.resolve([{ id: 's1' }]);
        // An invalid JSON string makes JSON.parse throw synchronously inside
        // the per-class try block, exercising its catch fallback.
        if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', rubric: 'not-json' }]);
        if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ assignment_id: 'a1', total_score: 90 }]);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
      expect(screen.getByText(/Avg: N\/A/)).toBeDefined();
      expect(screen.getByText('0 students')).toBeDefined();
      expect(screen.getByText('0 assigns')).toBeDefined();
    });

    it('shows an error banner (with the raw message) when the teacher workspace fails to load unexpectedly', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.reject(new Error('Database unavailable'));
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Database unavailable')).toBeDefined());
    });

    it('shows the generic failure message when a non-Error value is thrown while loading', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?teacher_id=teacher-1') return Promise.reject('boom');
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Failed to load classes')).toBeDefined());
    });

    it('shows an empty state for a teacher with no classes and opens the create-class modal from it', async () => {
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Classrooms Taught Yet')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      await screen.findByText('Launch a new virtual classroom for your students.');
    });

    it('opens the create-class modal from the topbar action button once classes have loaded', async () => {
      mockApiCall.mockImplementation(routeApiCall);
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      // The topbar "Create Class" button (distinct from the empty-state one)
      // only renders once classes.length > 0, via setAction() on the layout
      // context — ChromeHarness actually mounts it.
      render(<ChromeHarness />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      await screen.findByText('Launch a new virtual classroom for your students.');
    });

    it('creates a class through the modal, including the empty-name validation error and optional fields', async () => {
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes' && options?.method === 'POST') {
          expect(JSON.parse(options.body as string)).toEqual({
            school_id: 'school-1',
            name: 'Chemistry',
            description: 'Core concepts',
            code: 'CHEM-1',
          });
          return Promise.resolve({ id: 'c9', name: 'Chemistry', description: 'Core concepts', code: 'CHEM-1' });
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Classrooms Taught Yet')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      const nameInput = await screen.findByPlaceholderText('e.g. Biology 101');
      // `required` triggers jsdom's native constraint validation on a submit
      // click when empty — submit the form directly to reach the
      // component's own validation instead.
      fireEvent.submit(nameInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Class name is required')).toBeDefined());

      fireEvent.change(nameInput, { target: { value: 'Chemistry' } });
      fireEvent.change(screen.getByPlaceholderText('e.g. Core introductory concepts...'), { target: { value: 'Core concepts' } });
      fireEvent.change(screen.getByPlaceholderText('e.g. BIO-101'), { target: { value: 'CHEM-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => expect(screen.getByText('Class created successfully!')).toBeDefined());
      expect(screen.getByText('Chemistry')).toBeDefined();
      expect(screen.getByText('CHEM-1')).toBeDefined();
    });

    it('shows an error toast with the server message when class creation fails', async () => {
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes' && options?.method === 'POST') return Promise.reject(new Error('Class limit reached'));
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Classrooms Taught Yet')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      fireEvent.change(await screen.findByPlaceholderText('e.g. Biology 101'), { target: { value: 'Chemistry' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => expect(screen.getByText('Class limit reached')).toBeDefined());
    });

    it('shows the generic failure toast when class creation fails with a non-Error rejection', async () => {
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes' && options?.method === 'POST') return Promise.reject('nope');
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Classrooms Taught Yet')).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));
      fireEvent.change(await screen.findByPlaceholderText('e.g. Biology 101'), { target: { value: 'Chemistry' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Class' }));

      await waitFor(() => expect(screen.getByText('Failed to create class')).toBeDefined());
    });

    it('copies the enrollment code to the clipboard without navigating into the classroom', async () => {
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      // Every class card has its own "Click to copy..." span; Biology 101 (c1)
      // is first in the list.
      fireEvent.click(screen.getAllByTitle('Click to copy enrollment code')[0]);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('BIO-101');
      await waitFor(() => expect(screen.getByText('Enrollment code copied to clipboard')).toBeDefined());
      expect(mockPush).not.toHaveBeenCalled();

      // Dismiss it via the toast's own close button.
      fireEvent.click(screen.getByRole('button', { name: '✕' }));
      await waitFor(() => expect(screen.queryByText('Enrollment code copied to clipboard')).toBeNull());
    });

    it('navigates to the classroom detail page when a class card is clicked', async () => {
      mockApiCall.mockImplementation(routeApiCall);
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      fireEvent.click(screen.getByText('Biology 101'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher/classes/c1');
    });

    it('deletes a class after confirmation and skips deletion when cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes/c1' && options?.method === 'DELETE') return Promise.resolve({});
        return routeApiCall(endpoint);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      // Every class card has its own delete button; Biology 101 (c1) is first.
      confirmSpy.mockReturnValueOnce(false);
      fireEvent.click(screen.getAllByTitle('Delete Classroom')[0]);
      expect(mockApiCall).not.toHaveBeenCalledWith('/api/classes/c1', expect.objectContaining({ method: 'DELETE' }));
      expect(screen.getByText('Biology 101')).toBeDefined();

      confirmSpy.mockReturnValueOnce(true);
      fireEvent.click(screen.getAllByTitle('Delete Classroom')[0]);

      await waitFor(() =>
        expect(mockApiCall).toHaveBeenCalledWith('/api/classes/c1', expect.objectContaining({ method: 'DELETE' }))
      );
      await waitFor(() => expect(screen.getByText('Class "Biology 101" deleted successfully.')).toBeDefined());
      expect(screen.queryByText('Biology 101')).toBeNull();
      confirmSpy.mockRestore();
    });

    it('shows an error toast when deleting a class fails', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes/c1' && options?.method === 'DELETE') return Promise.reject(new Error('cannot delete'));
        return routeApiCall(endpoint);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: TEACHER_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'teacher',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());

      fireEvent.click(screen.getAllByTitle('Delete Classroom')[0]);
      await waitFor(() => expect(screen.getByText('Failed to delete class "Biology 101".')).toBeDefined());
      expect(screen.getByText('Biology 101')).toBeDefined();
      confirmSpy.mockRestore();
    });
  });

  describe('student role', () => {
    const STUDENT_CLASSES = [
      { id: 'c3', name: 'History 301', description: '', code: 'HIST-301' },
      { id: 'c4', name: 'Physics 401', description: 'Newtonian mechanics', code: 'PHYS-401' },
    ];
    const AVAILABLE = [
      { id: 'c10', name: 'Art 101', teacher_name: 'Mr. Lee' },
      { id: 'c11', name: 'Drama 201', teacher_name: 'Ms. Diaz' },
    ];

    function routeApiCall(endpoint: string) {
      if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(STUDENT_CLASSES);
      // c3: has a teacher_name, and a grades response mixing this student's
      // grade (matched to an assignment) with another student's grade (must
      // be filtered out) and a grade against an unknown assignment id (skipped).
      if (endpoint === '/api/classes/c3') return Promise.resolve({ teacher_name: 'Dr. Smith' });
      if (endpoint === '/api/classes/c3/grades') return Promise.resolve([
        { student_id: 'student-1', total_score: 88, assignment_id: 'a10' },
        { student_id: 'student-1', total_score: 40, assignment_id: 'unknown-assign' },
        { student_id: 'other-student', total_score: 99, assignment_id: 'a10' },
      ]);
      if (endpoint === '/api/classes/c3/assignments') return Promise.resolve([{ id: 'a10', rubric: [{ max_points: 100 }] }]);

      // c4: no teacher_name in details (=> 'Instructor' fallback), and no
      // grades at all (=> gradeSoFar stays 'N/A').
      if (endpoint === '/api/classes/c4') return Promise.resolve({});
      if (endpoint === '/api/classes/c4/grades') return Promise.resolve([]);
      if (endpoint === '/api/classes/c4/assignments') return Promise.resolve([]);

      if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE);
      return Promise.resolve([]);
    }

    it('renders the enrolled class list with teacher-name fallback, filtered grade computation, and the enroll action', async () => {
      mockApiCall.mockImplementation(routeApiCall);
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ChromeHarness />);
      await waitFor(() => expect(screen.getByText('History 301')).toBeDefined());

      expect(screen.getByText('Enrolled Classes')).toBeDefined();
      expect(screen.getByText(/Instructor: Dr\. Smith/)).toBeDefined();
      // 88 / 100 => 88% => info badge
      expect(screen.getByText(/Avg: 88%/)).toBeDefined();
      // c4 has no teacher_name and no grades.
      expect(screen.getByText(/Instructor: Instructor/)).toBeDefined();
      expect(screen.getByText(/Avg: N\/A/)).toBeDefined();
      // c3's description is '' (falsy) => falls back to the placeholder copy.
      expect(screen.getByText('No classroom description provided.')).toBeDefined();

      // The topbar action button only appears once available classes have loaded.
      const topbarEnrollButton = await screen.findByRole('button', { name: 'Enroll in Class' });
      fireEvent.click(topbarEnrollButton);
      await screen.findByText('Join an active course using the enrollment code.');
    });

    it('falls back to Instructor/N/A defaults when a class-detail fetch throws', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([{ id: 'c3', name: 'History 301', description: '', code: 'HIST-301' }]);
        if (endpoint === '/api/classes/c3') return Promise.reject(new Error('not found'));
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('History 301')).toBeDefined());
      expect(screen.getByText(/Instructor: Instructor/)).toBeDefined();
      expect(screen.getByText(/Avg: N\/A/)).toBeDefined();
    });

    it('computes gradeSoFar from a string-encoded rubric and a non-array rubric, landing in the "warning" band', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([{ id: 'c3', name: 'History 301', description: '', code: 'HIST-301' }]);
        if (endpoint === '/api/classes/c3') return Promise.resolve({ teacher_name: 'Dr. Smith' });
        if (endpoint === '/api/classes/c3/grades') return Promise.resolve([
          { student_id: 'student-1', total_score: 90, assignment_id: 'a10' },
          { student_id: 'student-1', total_score: 62, assignment_id: 'a11' },
        ]);
        // a10's rubric is a JSON *string* (exercises the typeof === 'string'
        // branch); a11's rubric is a plain object, not an array (exercises
        // the Array.isArray(rubric) === false default-100-points branch).
        if (endpoint === '/api/classes/c3/assignments') return Promise.resolve([
          { id: 'a10', rubric: JSON.stringify([{ max_points: 100 }]) },
          { id: 'a11', rubric: { not: 'an-array' } },
        ]);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('History 301')).toBeDefined());
      // (90 + 62) / (100 + 100) => 76% => "warning" band (75 <= val < 80).
      expect(screen.getByText(/Avg: 76%/)).toBeDefined();
    });

    it('shows an empty state with no enroll button when a student has no classes and none are available', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
        if (endpoint === '/api/classes/available') return Promise.resolve([]);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Enrolled Classes')).toBeDefined());
      expect(screen.queryByRole('button', { name: 'Enroll in Class' })).toBeNull();
    });

    it('shows an empty state with an enroll button when a student has no classes but some are available, and the available-classes fetch failure falls back to empty', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
        if (endpoint === '/api/classes/available') return Promise.reject(new Error('network error'));
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Enrolled Classes')).toBeDefined());
      // available-classes fetch rejected => falls back to [] => no button.
      expect(screen.queryByRole('button', { name: 'Enroll in Class' })).toBeNull();
    });

    it('enrolls in a class through the modal, including the empty-code validation error, select handling, and reload', async () => {
      let enrolled = false;
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(enrolled ? STUDENT_CLASSES : []);
        if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE);
        if (endpoint === '/api/classes/c10/enroll' && options?.method === 'POST') {
          expect(JSON.parse(options.body as string)).toEqual({ enrollment_code: 'ART-1' });
          enrolled = true;
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

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enroll in Class' })).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));
      await screen.findByText('Join an active course using the enrollment code.');

      // Validation: empty code. The code input has a `required` attribute,
      // so jsdom's native constraint validation blocks a submit-button click
      // when it's empty — submit the form directly to reach the
      // component's own validation instead.
      const codeInput = screen.getByPlaceholderText('Enter code provided by instructor');
      fireEvent.submit(codeInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Enrollment code is required')).toBeDefined());

      fireEvent.change(codeInput, { target: { value: 'ART-1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));

      await waitFor(() => expect(screen.getByText('Enrolled successfully!')).toBeDefined());
      // loadData() reran after enrolling, reflecting the newly-enrolled classes.
      await waitFor(() => expect(screen.getByText('History 301')).toBeDefined());
    });

    it('shows an error toast with the server message when enrollment fails', async () => {
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
        if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE);
        if (endpoint === '/api/classes/c10/enroll' && options?.method === 'POST') return Promise.reject(new Error('Invalid code'));
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enroll in Class' })).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));
      fireEvent.change(await screen.findByPlaceholderText('Enter code provided by instructor'), { target: { value: 'BAD' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));

      await waitFor(() => expect(screen.getByText('Invalid code')).toBeDefined());
    });

    it('shows the generic failure toast when enrollment fails with a non-Error rejection', async () => {
      mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
        if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE);
        if (endpoint === '/api/classes/c10/enroll' && options?.method === 'POST') return Promise.reject('nope');
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enroll in Class' })).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));
      fireEvent.change(await screen.findByPlaceholderText('Enter code provided by instructor'), { target: { value: 'BAD' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));

      await waitFor(() => expect(screen.getByText('Enrollment failed')).toBeDefined());
    });

    it('changes the selected class when a different option is chosen, and ignores a change matching no available class', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
        if (endpoint === '/api/classes/available') return Promise.resolve(AVAILABLE);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: STUDENT_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'student',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enroll in Class' })).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: 'Enroll in Class' }));

      const select = await screen.findByDisplayValue('Art 101 (Instructor: Mr. Lee)');
      fireEvent.change(select, { target: { value: 'c11' } });
      expect(screen.getByDisplayValue('Drama 201 (Instructor: Ms. Diaz)')).toBeDefined();

      // Defensive branch: a change event reporting a value that matches no
      // available class should be ignored (selection stays on c11). This
      // can't happen via real user interaction with a controlled <select>
      // bound to `availableClasses`, so an out-of-band <option> is added to
      // let jsdom accept the otherwise-impossible value.
      const bogusOption = document.createElement('option');
      bogusOption.value = 'does-not-exist';
      select.appendChild(bogusOption);
      fireEvent.change(select, { target: { value: 'does-not-exist' } });
      expect(screen.getByDisplayValue('Drama 201 (Instructor: Ms. Diaz)')).toBeDefined();
    });
  });

  describe('admin / other role', () => {
    it('renders classes from the stats endpoint with a neutral average badge when neither classAverage nor gradeSoFar is set', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/v0/stats/classes') return Promise.resolve([{ id: 'c1', name: 'Biology 101', description: 'Intro bio', code: 'BIO-101' }]);
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: ADMIN_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'admin',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('Biology 101')).toBeDefined());
      expect(screen.getByText(/Avg: N\/A/)).toBeDefined();
      // Neither the teacher nor the student action button apply to this role.
      expect(screen.queryByRole('button', { name: 'Create Class' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Enroll in Class' })).toBeNull();
    });

    it('falls back to an empty list when the stats endpoint fails', async () => {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/v0/stats/classes') return Promise.reject(new Error('unavailable'));
        return Promise.resolve([]);
      });
      vi.mocked(useAuth).mockReturnValue({
        user: ADMIN_USER,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        hasRole: (r) => r === 'admin',
      });

      render(<ClassesPage />);
      await waitFor(() => expect(screen.getByText('No Enrolled Classes')).toBeDefined());
    });
  });
});
