// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import DashboardPage from './page';
import { useAuth } from '../../components/AuthProvider';

afterEach(() => {
  cleanup();
  mockPush.mockClear();
});

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock ProtectedRoute to just render children
vi.mock('../../components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock AuthProvider hook
vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock the child dashboards so we don't need to mock their fetch calls
vi.mock('./admin/page', () => ({
  default: () => <div data-testid="admin-view">Admin Dashboard View</div>,
}));

vi.mock('./teacher/page', () => ({
  default: () => <div data-testid="teacher-view">Teacher Dashboard View</div>,
}));

vi.mock('./student/page', () => ({
  default: () => <div data-testid="student-view">Student Dashboard View</div>,
}));

describe('Dashboard Role Router', () => {
  it('should render the Admin view when the authenticated user is an admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'admin-id',
        name: 'System Admin',
        role: 'admin',
        email: 'admin@university.edu',
        school_id: null,
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<DashboardPage />);
    expect(screen.getByTestId('admin-view')).toBeDefined();
    expect(screen.queryByTestId('teacher-view')).toBeNull();
    expect(screen.queryByTestId('student-view')).toBeNull();
  });

  it('should render the Teacher view when the authenticated user is a teacher', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'teacher-id',
        name: 'Math Teacher',
        role: 'teacher',
        email: 'teacher@university.edu',
        school_id: 'school-id',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });

    render(<DashboardPage />);
    expect(screen.getByTestId('teacher-view')).toBeDefined();
    expect(screen.queryByTestId('admin-view')).toBeNull();
    expect(screen.queryByTestId('student-view')).toBeNull();
  });

  it('should render the Student view when the authenticated user is a student', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'student-id',
        name: 'Math Student',
        role: 'student',
        email: 'student@university.edu',
        school_id: 'school-id',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<DashboardPage />);
    expect(screen.getByTestId('student-view')).toBeDefined();
    expect(screen.queryByTestId('admin-view')).toBeNull();
    expect(screen.queryByTestId('teacher-view')).toBeNull();
  });

  it('shows a loading spinner while the session check is in flight', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    const { container } = render(<DashboardPage />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to /login and renders nothing once loading finishes with no user', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    const { container } = render(<DashboardPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(container.firstChild).toBeNull();
  });

  it('renders a fallback message for an unrecognized role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'x',
        name: 'X',
        // Cast past the role union to exercise the defensive fallback branch.
        role: 'superadmin' as unknown as 'admin',
        email: 'x@e.edu',
        school_id: null,
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<DashboardPage />);
    expect(screen.getByText('Unknown role')).toBeDefined();
  });
});
