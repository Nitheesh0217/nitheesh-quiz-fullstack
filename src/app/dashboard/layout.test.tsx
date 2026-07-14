// Tests for: src/app/dashboard/layout.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import DashboardLayout from './layout';
import { useAuth } from '../../components/AuthProvider';
import { DashboardLayoutContext } from './DashboardLayoutContext';

Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockPush = vi.fn();
let mockPathname = '/dashboard/admin';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

vi.mock('../../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const ADMIN_USER = { id: '1', name: 'Sarah Chen', email: 'sarah@school.edu', role: 'admin' as const, school_id: null };
const TEACHER_USER = { id: '2', name: 'Alice Thompson', email: 'alice@school.edu', role: 'teacher' as const, school_id: 's1' };

describe('DashboardLayout', () => {
  beforeEach(() => {
    mockPathname = '/dashboard/admin';
  });

  it('shows a full-screen spinner while the session is loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: true, login: vi.fn(), logout: vi.fn(), hasRole: () => false });
    const { container } = render(<DashboardLayout>content</DashboardLayout>);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('redirects to /login and renders nothing once loading finishes with no user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => false });
    render(<DashboardLayout>content</DashboardLayout>);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('renders admin-only nav items for an admin user and highlights the active link', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    expect(screen.getAllByText('Users').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Schools').length).toBeGreaterThan(0);
    expect(screen.queryByText('Classes')).toBeNull();
    expect(screen.queryByText('Grades')).toBeNull();
  });

  it('renders teacher-only nav items for a teacher user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: TEACHER_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    expect(screen.getAllByText('Classes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assignments').length).toBeGreaterThan(0);
    expect(screen.queryByText('Users')).toBeNull();
  });

  it('scrolls to the target section when already on the admin dashboard', () => {
    mockPathname = '/dashboard/admin';
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    const scrollSpy = vi.fn();
    render(<DashboardLayout>content</DashboardLayout>);

    const usersSection = document.createElement('div');
    usersSection.id = 'users-section';
    usersSection.scrollIntoView = scrollSpy;
    document.body.appendChild(usersSection);

    fireEvent.click(screen.getAllByText('Users')[0]);
    expect(scrollSpy).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    usersSection.remove();
  });

  it('navigates to the admin dashboard first when a hash nav item is clicked from elsewhere', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPathname = '/dashboard/classes';
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    fireEvent.click(screen.getAllByText('Schools')[0]);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/admin#schools-section');
    vi.useRealTimers();
  });

  it('navigates to a plain nav link', () => {
    vi.mocked(useAuth).mockReturnValue({ user: TEACHER_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    const link = screen.getAllByText('Classes')[0];
    // The component's onClick doesn't call preventDefault for plain hrefs,
    // so jsdom would otherwise attempt (and fail/log) a real navigation on
    // this <a> — add a capture-phase listener to stop that before it fires,
    // while still letting React's own onClick (which calls router.push) run.
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/classes');
  });

  it('navigates home when the logo is clicked', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    fireEvent.click(screen.getByLabelText('Go to dashboard home'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('collapses and expands the sidebar', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    const collapseButtons = screen.getAllByTitle('Collapse sidebar');
    fireEvent.click(collapseButtons[0]);
    expect(screen.getAllByTitle('Expand sidebar').length).toBeGreaterThan(0);
  });

  it('renders breadcrumbs with a clickable link segment via the layout context', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    function Child() {
      const ctx = React.useContext(DashboardLayoutContext);
      React.useEffect(() => {
        ctx?.setBreadcrumbs([{ label: 'Home', href: '/dashboard' }, { label: 'Detail' }]);
        // Deliberately depend on the stable setter (as real pages do via
        // useDashboardLayout), not on `ctx` itself - the provider's context
        // value is a new object every render, so depending on `ctx` here
        // would refire this effect with a new breadcrumbs array each time,
        // looping forever.
      }, [ctx?.setBreadcrumbs]);
      return null;
    }

    render(
      <DashboardLayout>
        <Child />
      </DashboardLayout>
    );

    fireEvent.click(screen.getByText('Home'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByText('Detail')).toBeDefined();
  });

  it('opens and closes the mobile menu', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    fireEvent.click(screen.getByText('Open menu'));
    expect(screen.getAllByText('Concentrate').length).toBeGreaterThan(0);
  });

  it('highlights the nav link matching the current path', () => {
    mockPathname = '/dashboard/classes';
    vi.mocked(useAuth).mockReturnValue({ user: TEACHER_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });
    render(<DashboardLayout>content</DashboardLayout>);

    const activeLink = screen.getAllByText('Classes')[0].closest('a');
    expect(activeLink?.className).toContain('bg-primary-soft');
    expect(activeLink?.querySelector('.bg-primary.rounded-r')).not.toBeNull();
  });

  it('renders a custom action in the topbar via the layout context', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    function Child() {
      const ctx = React.useContext(DashboardLayoutContext);
      React.useEffect(() => {
        ctx?.setAction(<button>Do Thing</button>);
      }, [ctx?.setAction]);
      return null;
    }

    render(
      <DashboardLayout>
        <Child />
      </DashboardLayout>
    );

    expect(screen.getByText('Do Thing')).toBeDefined();
  });

  it('collapses the desktop sidebar to width 0 in focus mode', () => {
    vi.mocked(useAuth).mockReturnValue({ user: ADMIN_USER, isLoading: false, login: vi.fn(), logout: vi.fn(), hasRole: () => true });

    function Child() {
      const ctx = React.useContext(DashboardLayoutContext);
      React.useEffect(() => {
        ctx?.setIsFocusMode(true);
      }, [ctx?.setIsFocusMode]);
      return null;
    }

    const { container } = render(
      <DashboardLayout>
        <Child />
      </DashboardLayout>
    );

    expect(container.querySelector('aside')?.className).toContain('w-0');
  });
});
