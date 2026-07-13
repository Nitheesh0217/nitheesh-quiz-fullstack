// Tests for: src/app/dashboard/student/grades/[id]/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import GradeDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
  useParams: () => ({ id: 'g1' }),
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

const STUDENT = { id: 'student-1', email: 'a@b.edu', name: 'Alex', role: 'student' as const, school_id: null };

const GRADES = [
  {
    grade_id: 'g1',
    assignment_id: 'a1',
    assignment_title: 'Essay',
    class_name: 'Biology',
    total_score: 45,
    feedback: 'Great job',
    graded_at: '2026-01-01T00:00:00Z',
    teacher_name: 'Dr. Smith',
    rubric_scores: [{ criterion: 'Clarity', score: 45 }],
  },
];
const ASSIGNMENT = { id: 'a1', rubric: [{ criterion: 'Clarity', max_points: 50 }] };

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/grades?student_id=student-1') return Promise.resolve(GRADES);
  if (endpoint === '/api/assignments/a1') return Promise.resolve(ASSIGNMENT);
  return Promise.resolve({});
}

describe('GradeDetailPage', () => {
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

  it('renders the grade detail with rubric breakdown and feedback', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<GradeDetailPage />);

    await waitFor(() => expect(screen.getByText('Essay')).toBeDefined());
    expect(screen.getByText('Biology')).toBeDefined();
    expect(screen.getByText(/Graded by Dr. Smith/)).toBeDefined();
    expect(screen.getByText('45')).toBeDefined();
    expect(screen.getByText('90%')).toBeDefined();
    expect(screen.getByText('Clarity')).toBeDefined();
    expect(screen.getByText('45 / 50')).toBeDefined();
    expect(screen.getByText('"Great job"')).toBeDefined();
  });

  it('shows "Grade not found" when no matching grade exists', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/grades?student_id=student-1') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<GradeDetailPage />);
    await waitFor(() => expect(screen.getByText('Grade not found')).toBeDefined());
  });

  it('falls back to "Instructor" when no teacher name is present', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/grades?student_id=student-1') {
        return Promise.resolve([{ ...GRADES[0], teacher_name: undefined }]);
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<GradeDetailPage />);
    await waitFor(() => expect(screen.getByText(/Graded by Instructor/)).toBeDefined());
  });

  it('handles a fetch failure by logging and stops loading without a grade', async () => {
    mockApiCall.mockRejectedValue(new Error('network error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<GradeDetailPage />);
    await waitFor(() => expect(screen.getByText('Grade not found')).toBeDefined());
  });

  it('navigates back when the back button is clicked', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({ user: STUDENT, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    render(<GradeDetailPage />);
    await waitFor(() => expect(screen.getByText('Essay')).toBeDefined());

    screen.getByText('Back to Grades').click();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
