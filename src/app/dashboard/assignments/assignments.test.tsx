// Tests for: src/app/dashboard/assignments/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import AssignmentsPage from './page';
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

const STUDENT = { id: 'student-1', email: 'a@b.edu', name: 'Alex', role: 'student' as const, school_id: null };
const TEACHER = { id: 'teacher-1', email: 't@b.edu', name: 'Alice', role: 'teacher' as const, school_id: 's1' };

const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const CLASSES = [{ id: 'c1', name: 'Biology' }];
const ASSIGNMENTS = [
  { id: 'a1', title: 'Graded Essay', description: 'desc', due_date: PAST, rubric: [{ max_points: 100 }] },
  { id: 'a2', title: 'Submitted Quiz', description: '', due_date: PAST, rubric: [{ max_points: 100 }] },
  { id: 'a3', title: 'Overdue Lab', due_date: PAST, rubric: [{ max_points: 100 }] },
  { id: 'a4', title: 'Pending Homework', due_date: FUTURE, rubric: [{ max_points: 100 }] },
];
const GRADES = [{ student_id: 'student-1', total_score: 90, assignment_id: 'a1' }];

function routeApiCall(endpoint: string) {
  if (endpoint.startsWith('/api/classes?')) return Promise.resolve(CLASSES);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
  return Promise.resolve([]);
}

describe('AssignmentsPage', () => {
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
    render(<AssignmentsPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('renders all assignment statuses for a student and filters by tab', async () => {
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2') return Promise.resolve({ id: 'sub-2' });
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('Graded Essay')).toBeDefined());

    expect(screen.getByText(/Graded: 90\/100/)).toBeDefined();
    expect(screen.getByText('Submitted')).toBeDefined();
    expect(screen.getByText('Overdue')).toBeDefined();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent?.trim() === 'Pending')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'graded' }));
    expect(screen.getByText('Graded Essay')).toBeDefined();
    expect(screen.queryByText('Pending Homework')).toBeNull();
  });

  it('navigates to the student assignment detail page when a card is clicked', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('Graded Essay')).toBeDefined());
    fireEvent.click(screen.getByText('Graded Essay'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/student/classes/c1/assignments/a1');
  });

  it('renders the teacher view with evaluation criteria badges and navigates to the teacher assignment page', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({ user: TEACHER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('Graded Essay')).toBeDefined());
    expect(screen.getAllByText('1 evaluation criteria').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'graded' })).toBeNull();

    fireEvent.click(screen.getByText('Graded Essay'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/teacher/assignments/a1');
  });

  it('shows an empty state with role-specific copy', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/classes?')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({ user: TEACHER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('No Assignments Found')).toBeDefined());
    expect(screen.getByText('Navigate to a specific classroom to publish coursework.')).toBeDefined();
  });

  it('shows an error banner when the top-level request fails unexpectedly', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/classes?')) return Promise.reject(new Error('Network error'));
      return Promise.resolve([]);
    });
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('Network error')).toBeDefined());
  });

  it('logs a warning and skips a class whose assignments fail to load', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.reject(new Error('boom'));
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<AssignmentsPage />);
    await waitFor(() => expect(screen.getByText('No Assignments Found')).toBeDefined());
  });
});
