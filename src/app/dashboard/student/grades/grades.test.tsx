// Tests for: src/app/dashboard/student/grades/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import StudentGradesPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

vi.mock('@/components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../DashboardLayoutContext', () => ({
  useDashboardLayout: vi.fn(),
}));

const mockApiCall = vi.fn();
vi.mock('@/lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const STUDENT = { id: 'student-1', email: 'a@b.edu', name: 'Alex', role: 'student' as const, school_id: null };
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const CLASSES = [{ id: 'c1', name: 'Biology', code: 'BIO101' }];
const ASSIGNMENTS = [
  { id: 'a1', title: 'Essay', due_date: PAST, rubric: [{ criterion: 'Clarity', max_points: 50 }] },
  { id: 'a2', title: 'Quiz', due_date: PAST, rubric: [{ criterion: 'Accuracy', max_points: 50 }] },
  { id: 'a3', title: 'Lab', due_date: PAST, rubric: [{ criterion: 'Effort', max_points: 50 }] },
  { id: 'a4', title: 'Homework', due_date: FUTURE, rubric: [{ criterion: 'Effort', max_points: 50 }] },
];
const GRADES = [
  { student_id: 'student-1', total_score: 45, feedback: 'Great job', assignment_id: 'a1', grade_id: 'g1' },
];

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve(CLASSES);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
  if (endpoint === '/api/classes/c1') return Promise.resolve({ teacher_name: 'Dr. Smith' });
  return Promise.resolve({});
}

describe('StudentGradesPage', () => {
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
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
  });

  it('renders the GPA banner and course row, then expands to show all assignment statuses', async () => {
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    mockApiCall.mockImplementation(routeApiCall);

    render(<StudentGradesPage />);
    await waitFor(() => expect(screen.getByText('Biology')).toBeDefined());
    expect(screen.getByText((_, el) => el?.textContent === 'Instructor: Dr. Smith')).toBeDefined();

    fireEvent.click(screen.getByText('Biology'));
    await waitFor(() => expect(screen.getByText('Essay')).toBeDefined());

    expect(screen.getByText((_, el) => el?.tagName === 'P' && /45\s*\/ 50 pts/.test(el.textContent || ''))).toBeDefined();
    expect(screen.getByText('"Great job"')).toBeDefined();
    expect(screen.getByText('View full grade details')).toBeDefined();
    expect(screen.getByText('Submitted (Pending Grade)')).toBeDefined();
    expect(screen.getByText('Missing / Overdue')).toBeDefined();
    expect(screen.getByText('Not Submitted')).toBeDefined();

    fireEvent.click(screen.getByText('Biology'));
    await waitFor(() => expect(screen.queryByText('Essay')).toBeNull());
  });

  it('shows an empty state when the student has no enrolled classes', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes?student_id=student-1') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<StudentGradesPage />);
    await waitFor(() => expect(screen.getByText('You are not enrolled in any classes yet.')).toBeDefined());
  });

  it('shows an empty assignments message when a class has none', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });

    render(<StudentGradesPage />);
    await waitFor(() => expect(screen.getByText('Biology')).toBeDefined());
    fireEvent.click(screen.getByText('Biology'));
    await waitFor(() => expect(screen.getByText('No assignments posted for this course yet.')).toBeDefined());
  });

  it('falls back to a default course card when enriching a class throws synchronously', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay', due_date: PAST, rubric: 'not-json' }]);
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<StudentGradesPage />);
    await waitFor(() => expect(screen.getByText('Biology')).toBeDefined());
    // "In Progress" appears both as the Status column value and the Grade badge.
    expect(screen.getAllByText('In Progress').length).toBe(2);
  });

  it('computes B/C/D/F letter grades at their respective thresholds', async () => {
    async function renderWithScore(score: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes/c1/grades') return Promise.resolve([{ ...GRADES[0], total_score: score }]);
        if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([ASSIGNMENTS[0]]);
        return routeApiCall(endpoint);
      });
      const { unmount } = render(<StudentGradesPage />);
      await waitFor(() => expect(screen.getByText('Biology')).toBeDefined());
      return unmount;
    }

    let unmount = await renderWithScore(41); // 82% -> B
    expect(screen.getByText('B (82%)')).toBeDefined();
    unmount();
    cleanup();

    unmount = await renderWithScore(36); // 72% -> C
    expect(screen.getByText('C (72%)')).toBeDefined();
    unmount();
    cleanup();

    unmount = await renderWithScore(31); // 62% -> D
    expect(screen.getByText('D (62%)')).toBeDefined();
    unmount();
    cleanup();

    await renderWithScore(10); // 20% -> F
    expect(screen.getByText('F (20%)')).toBeDefined();
  });
});
