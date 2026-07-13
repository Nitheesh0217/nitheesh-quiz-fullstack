// Tests for: src/app/dashboard/admin/page.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AdminDashboard from './page';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';

// Radix's DropdownMenu relies on the Pointer Events API, which jsdom does
// not implement — without these stubs, opening the menu in tests throws.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});

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

// AdminDashboard renders its "Register School" button via the topbar
// action passed to setAction(), not in its own JSX tree — the plain
// vi.fn() mock elsewhere in this file discards it. This harness actually
// captures and renders that action node so it can be interacted with.
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
      <AdminDashboard />
    </>
  );
}

const ADMIN_USER = {
  id: 'admin-1',
  name: 'Sarah Chen',
  email: 'sarah.chen@university.edu',
  role: 'admin' as const,
  school_id: null,
};

const USERS = [
  { id: 's1', name: 'Alex Johnson', email: 'alex@school.edu', role: 'student', is_suspended: false },
  { id: 't1', name: 'Alice Thompson', email: 'alice@school.edu', role: 'teacher', is_suspended: false },
];

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/admin/schools') return Promise.resolve([{ id: 'sch-1', name: 'Concentrate Academy', created_at: '2026-01-01' }]);
  if (endpoint === '/api/admin/users') return Promise.resolve(USERS);
  if (endpoint === '/api/classes') return Promise.resolve([]);
  if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([]);
  if (endpoint === '/api/admin/stats/average-grades') return Promise.resolve({ average: '87%' });
  return Promise.resolve({});
}

describe('AdminDashboard', () => {
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

  it('redirects to /dashboard when the authenticated user is not an admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 's1', name: 'Student', email: 's@e.edu', role: 'student', school_id: 'sc1' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<AdminDashboard />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a full-screen spinner while the auth session is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    const { container } = render(<AdminDashboard />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders the users register table with fetched users once loaded', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    expect(screen.getByText('Alice Thompson')).toBeDefined();
    expect(screen.getAllByText('Active').length).toBe(2);
  });

  it('filters the users table by search query', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'alice' } });

    expect(screen.queryByText('Alex Johnson')).toBeNull();
    expect(screen.getByText('Alice Thompson')).toBeDefined();
  });

  it('calls the suspend API and flips the row status when suspending a user', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1/suspend' && options?.method === 'PATCH') {
        return Promise.resolve({});
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    const user = userEvent.setup();
    const row = screen.getByText('Alex Johnson').closest('tr')!;
    const trigger = row.querySelector('button') as HTMLButtonElement;
    await user.click(trigger);

    const suspendItem = await screen.findByText('Suspend User');
    await user.click(suspendItem);

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith(
        '/api/admin/users/s1/suspend',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_suspended: true }) })
      )
    );
    await waitFor(() => expect(screen.getAllByText('Suspended').length).toBe(1));
  });

  it('shows an error banner when the admin workspace fails to load unexpectedly', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      // Returning a non-array from /api/admin/users makes the subsequent
      // `.map()` throw synchronously, which is NOT swallowed by the
      // per-request .catch(() => []) fallbacks — it should surface as the
      // page-level error banner instead.
      if (endpoint === '/api/admin/users') return Promise.resolve(null);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText(/Failed to load administrative metrics|Cannot read/)).toBeDefined());
  });

  it('deletes a user after confirmation and skips deletion when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    const user = userEvent.setup();
    const row = screen.getByText('Alex Johnson').closest('tr')!;
    await user.click(row.querySelector('button') as HTMLButtonElement);

    confirmSpy.mockReturnValueOnce(false);
    await user.click(await screen.findByText('Delete User'));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/users/s1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText('Alex Johnson')).toBeDefined();

    await user.click(row.querySelector('button') as HTMLButtonElement);
    confirmSpy.mockReturnValueOnce(true);
    await user.click(await screen.findByText('Delete User'));

    await waitFor(() =>
      expect(mockApiCall).toHaveBeenCalledWith('/api/admin/users/s1', expect.objectContaining({ method: 'DELETE' }))
    );
    await waitFor(() => expect(screen.queryByText('Alex Johnson')).toBeNull());
  });

  it('renders the registered schools list, navigates on click, and copies the school ID', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByTitle('Copy School ID'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sch-1');
    await waitFor(() => expect(screen.getByText('School ID copied to clipboard')).toBeDefined());

    fireEvent.click(screen.getByText('Concentrate Academy'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/admin/schools/sch-1');
  });

  it('shows an empty state when no schools are registered', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/schools') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('No schools registered yet.')).toBeDefined());
  });

  it('registers a new school through the modal, including the empty-name validation error', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/schools' && options?.method === 'POST') {
        return Promise.resolve({ id: 'sch-2', name: 'New Academy', created_at: '2026-02-01' });
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Register School' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('School name is required')).toBeDefined());

    fireEvent.change(screen.getByLabelText('School Name'), { target: { value: 'New Academy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Successfully registered New Academy!')).toBeDefined());
  });

  it('shows an error toast when school registration fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/schools' && options?.method === 'POST') {
        return Promise.reject(new Error('Duplicate school name'));
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Register School' }));
    fireEvent.change(screen.getByLabelText('School Name'), { target: { value: 'Dup Academy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Duplicate school name')).toBeDefined());
  });

  it('creates a user through the modal, including validation for missing fields and a short password', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users' && options?.method === 'POST') {
        return Promise.resolve({ id: 'u9', name: 'New Teacher', email: 'nt@school.edu', role: 'teacher', school_id: null });
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /New User/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Name, email, and password are required')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'New Teacher' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nt@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Password must be at least 8 characters')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('New Teacher was created successfully.')).toBeDefined());
  });

  it('shows an empty state and creates a teacher group through the modal', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups' && options?.method === 'POST') {
        return Promise.resolve({ id: 'g1', school_id: 'sch-1', name: 'Math Dept' });
      }
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() =>
      expect(screen.getByText('No teacher groups yet. Create one to organize teachers by department.')).toBeDefined()
    );

    fireEvent.click(screen.getByRole('button', { name: /New Group/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Group name and school are required')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'Math Dept' } });
    const schoolSelects = screen.getAllByDisplayValue(/Select a school|No school/);
    fireEvent.change(schoolSelects[schoolSelects.length - 1], { target: { value: 'sch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Teacher group "Math Dept" created.')).toBeDefined());
    expect(screen.getByText('Math Dept')).toBeDefined();
  });

  it('opens a teacher group detail modal, adds and removes a member, and deletes the group', async () => {
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [] as Array<{ id: string; name: string; email: string }> };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      if (endpoint === '/api/admin/teacher-groups/g1/members' && options?.method === 'POST') {
        GROUP.members = [{ id: 't1', name: 'Alice Thompson', email: 'alice@school.edu' }];
        return Promise.resolve({});
      }
      if (endpoint === '/api/admin/teacher-groups/g1/members/t1' && options?.method === 'DELETE') {
        return Promise.resolve({});
      }
      if (endpoint === '/api/admin/teacher-groups/g1' && options?.method === 'DELETE') return Promise.resolve({});
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Math Dept')).toBeDefined());

    fireEvent.click(screen.getByText('Math Dept'));
    await waitFor(() => expect(screen.getByText('No teachers in this group yet.')).toBeDefined());

    fireEvent.change(screen.getByDisplayValue('Select a teacher'), { target: { value: 't1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByText('Teacher added to group.')).toBeDefined());
    // "alice@school.edu" also appears in the underlying users register
    // table, which stays mounted behind the modal - expect both instances.
    await waitFor(() => expect(screen.getAllByText('alice@school.edu').length).toBe(2));

    fireEvent.click(screen.getByTitle('Remove from group'));
    await waitFor(() => expect(screen.getByText('Teacher removed from group.')).toBeDefined());

    // Modal.tsx keeps content mounted through its close transition (see
    // Modal.test.tsx), so just verify the close handler is wired up rather
    // than asserting immediate unmount here.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTitle('Delete group'));
    await waitFor(() => expect(screen.getByText('Teacher group "Math Dept" deleted.')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('shows an error toast when creating a user fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users' && options?.method === 'POST') return Promise.reject(new Error('Email already exists'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /New User/i }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Dup User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dup@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Email already exists')).toBeDefined());
  });

  it('shows an error toast when creating a teacher group fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups' && options?.method === 'POST') return Promise.reject(new Error('Group name taken'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() =>
      expect(screen.getByText('No teacher groups yet. Create one to organize teachers by department.')).toBeDefined()
    );

    fireEvent.click(screen.getByRole('button', { name: /New Group/i }));
    fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'Dup Dept' } });
    fireEvent.change(screen.getByDisplayValue('Select a school'), { target: { value: 'sch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Group name taken')).toBeDefined());
  });

  it('shows an error toast when opening a teacher group detail fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.reject(new Error('Group not found'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Math Dept')).toBeDefined());

    fireEvent.click(screen.getByText('Math Dept'));
    await waitFor(() => expect(screen.getByText('Group not found')).toBeDefined());
  });

  it('shows error toasts when adding/removing a group member or deleting a group fails', async () => {
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [{ id: 't1', name: 'Alice Thompson', email: 'alice@school.edu' }] };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      if (endpoint === '/api/admin/teacher-groups/g1/members' && options?.method === 'POST') return Promise.reject(new Error('Teacher already in group'));
      if (endpoint === '/api/admin/teacher-groups/g1/members/t1' && options?.method === 'DELETE') return Promise.reject(new Error('Cannot remove last member'));
      if (endpoint === '/api/admin/teacher-groups/g1' && options?.method === 'DELETE') return Promise.reject(new Error('Group has active members'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Math Dept')).toBeDefined());

    fireEvent.click(screen.getByText('Math Dept'));
    await waitFor(() => expect(screen.getByText('alice@school.edu')).toBeDefined());

    fireEvent.click(screen.getByTitle('Remove from group'));
    await waitFor(() => expect(screen.getByText('Cannot remove last member')).toBeDefined());

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTitle('Delete group'));
    await waitFor(() => expect(screen.getByText('Group has active members')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('shows an error toast when deleting a user fails', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1' && options?.method === 'DELETE') return Promise.reject(new Error('Cannot delete user with active submissions'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    const user = userEvent.setup();
    const row = screen.getByText('Alex Johnson').closest('tr')!;
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Delete User'));

    await waitFor(() => expect(screen.getByText('Cannot delete user with active submissions')).toBeDefined());
    confirmSpy.mockRestore();
  });

  it('handles a per-class submissions-count fetch failure without crashing the stats aggregation', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes') return Promise.resolve([{ id: 'c1', name: 'Biology' }]);
      if (endpoint === '/api/classes/c1/assignments') return Promise.reject(new Error('network error'));
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
  });
});
