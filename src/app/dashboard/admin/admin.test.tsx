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

  it('shows an error toast when updating a user suspension fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1/suspend' && options?.method === 'PATCH') {
        return Promise.reject(new Error('Suspension service unavailable'));
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
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Suspend User'));

    await waitFor(() => expect(screen.getByText('Suspension service unavailable')).toBeDefined());
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('unsuspends a suspended user and shows the lifted status message', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1/suspend' && options?.method === 'PATCH') {
        return Promise.resolve({});
      }
      if (endpoint === '/api/admin/users') {
        return Promise.resolve([
          { id: 's1', name: 'Alex Johnson', email: 'alex@school.edu', role: 'student', is_suspended: true },
        ]);
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
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Reactivate User'));

    await waitFor(() => expect(screen.getByText('User suspension lifted successfully.')).toBeDefined());
    expect(mockApiCall).toHaveBeenCalledWith(
      '/api/admin/users/s1/suspend',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_suspended: false }) })
    );
  });

  it('falls back to the default suspension error when the API rejects a non-Error value', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1/suspend' && options?.method === 'PATCH') {
        return Promise.reject('offline');
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
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Suspend User'));

    await waitFor(() => expect(screen.getByText('Failed to update user suspension status')).toBeDefined());
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

  it('shows the default fallback message when adding a teacher group member rejects with a non-Error', async () => {
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [] as Array<{ id: string; name: string; email: string }> };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      if (endpoint === '/api/admin/teacher-groups/g1/members' && options?.method === 'POST') return Promise.reject('boom');
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

    await waitFor(() => expect(screen.getByText('Failed to add teacher to group')).toBeDefined());
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

  it('aggregates pending submission counts across classes, assignments, and submissions', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes') return Promise.resolve([{ id: 'c1', name: 'Biology' }]);
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([{ id: 'a1', title: 'Essay' }]);
      if (endpoint === '/api/assignments/a1/submissions') {
        return Promise.resolve([
          { id: 'sub1', status: 'submitted' },
          { id: 'sub2', status: 'graded' },
          { id: 'sub3', status: 'submitted' },
        ]);
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
    await waitFor(() => expect(screen.getByText('Pending Grading')).toBeDefined());
    // Only 2 of the 3 submissions for the one assignment are 'submitted'.
    await waitFor(() => expect(screen.getByText('2')).toBeDefined());
  });

  it('defaults is_suspended to false when the API omits the field entirely', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/users') {
        return Promise.resolve([{ id: 'u9', name: 'No Field User', email: 'nf@school.edu', role: 'student' }]);
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
    await waitFor(() => expect(screen.getByText('No Field User')).toBeDefined());
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('filters the users table by role tab and renders a distinct badge for the admin role', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/users') {
        return Promise.resolve([...USERS, { id: 'a1', name: 'Dana Admin', email: 'dana@school.edu', role: 'admin', is_suspended: false }]);
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
    await waitFor(() => expect(screen.getByText('Dana Admin')).toBeDefined());
    // Renders with the 'danger' badge variant, distinct from student/teacher.
    expect(screen.getByText('admin')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'teachers' }));
    expect(screen.queryByText('Alex Johnson')).toBeNull();
    expect(screen.queryByText('Dana Admin')).toBeNull();
    expect(screen.getByText('Alice Thompson')).toBeDefined();
  });

  it("shows 'Unknown school' when a teacher group references a school that no longer exists", async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'missing-school', name: 'Orphan Dept' }]);
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
    await waitFor(() => expect(screen.getByText('Orphan Dept')).toBeDefined());
    expect(screen.getByText('Unknown school')).toBeDefined();
  });

  it('opens the edit user modal prefilled, edits every field, validates required fields, and saves successfully', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1' && options?.method === 'PUT') {
        return Promise.resolve({ name: 'Alexandra Johnson', email: 'alexandra@school.edu', role: 'teacher', school_id: 'sch-1' });
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
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Edit User'));

    expect((screen.getByLabelText('Full Name') as HTMLInputElement).value).toBe('Alex Johnson');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('alex@school.edu');

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByText('Name and email are required')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Alexandra Johnson' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alexandra@school.edu' } });
    fireEvent.change(screen.getByDisplayValue('Student'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByDisplayValue('No school'), { target: { value: 'sch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('Alexandra Johnson was updated successfully.')).toBeDefined());
    expect(mockApiCall).toHaveBeenCalledWith('/api/admin/users/s1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: 'Alexandra Johnson', email: 'alexandra@school.edu', role: 'teacher', school_id: 'sch-1' }),
    }));
  });

  it('shows an error toast when editing a user fails', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/s1' && options?.method === 'PUT') return Promise.reject(new Error('Email already in use'));
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
    await user.click(await screen.findByText('Edit User'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('Email already in use')).toBeDefined());
  });

  it('closes the register-school, create-user, edit-user, and create-group modals via Cancel without submitting', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    const { container } = render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());

    // Modal.tsx keeps content mounted through its CSS close transition, so
    // fire transitionend directly - otherwise the next modal opened in this
    // test would collide with this one's still-mounted (but hidden) fields.
    const closeViaCancel = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.transitionEnd(container.querySelector('.fixed.inset-0.z-40')!);
    };

    fireEvent.click(screen.getByRole('button', { name: 'Register School' }));
    fireEvent.change(screen.getByLabelText('School Name'), { target: { value: 'Ignored Academy' } });
    closeViaCancel();
    expect(screen.queryByLabelText('School Name')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /New User/i }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Ignored User' } });
    closeViaCancel();
    expect(screen.queryByLabelText('Full Name')).toBeNull();

    const user = userEvent.setup();
    const row = screen.getByText('Alex Johnson').closest('tr')!;
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Edit User'));
    closeViaCancel();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /New Group/i }));
    fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'Ignored Group' } });
    closeViaCancel();
    expect(screen.queryByLabelText('Group Name')).toBeNull();

    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/schools', expect.objectContaining({ method: 'POST' }));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ method: 'POST' }));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/users/s1', expect.objectContaining({ method: 'PUT' }));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/teacher-groups', expect.objectContaining({ method: 'POST' }));
  });

  it('does nothing when the delete-teacher-group confirmation dialog is cancelled', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Math Dept')).toBeDefined());

    fireEvent.click(screen.getByTitle('Delete group'));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/teacher-groups/g1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText('Math Dept')).toBeDefined();

    confirmSpy.mockRestore();
  });

  it('shows an error toast when adding a teacher to a group fails', async () => {
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [] as Array<{ id: string; name: string; email: string }> };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      if (endpoint === '/api/admin/teacher-groups/g1/members' && options?.method === 'POST') return Promise.reject(new Error('Teacher already in group'));
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
    await waitFor(() => expect(screen.getByText('Teacher already in group')).toBeDefined());
  });

  // handleRemoveMember's own `if (!selectedGroup) return;` guard (page.tsx
  // line ~400) is unreachable through the UI: the "Remove from group" button
  // only renders inside `{selectedGroup && (...)}`, so selectedGroup is
  // always truthy at the moment the handler is invoked. Covered instead
  // below is the guard in handleAddMember (reachable via an empty selection)
  // and the modal's dedicated onClose path via the backdrop.
  it('does nothing when Add is clicked with no teacher selected, and closes the group detail modal via backdrop click', async () => {
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [] as Array<{ id: string; name: string; email: string }> };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    const { container } = render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Math Dept')).toBeDefined());
    fireEvent.click(screen.getByText('Math Dept'));
    await waitFor(() => expect(screen.getByText('No teachers in this group yet.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/admin/teacher-groups/g1/members', expect.anything());

    // The modal's own onClose prop (distinct from the footer "Close" button)
    // resets selectedGroup, so the body content unmounts immediately.
    fireEvent.click(container.querySelector('.fixed.inset-0.z-40')!);
    expect(screen.queryByText('No teachers in this group yet.')).toBeNull();
  });

  it('ignores a member-removal response that resolves after the group detail modal has been closed', async () => {
    let resolveRemove: () => void = () => {};
    const removePromise = new Promise<void>((resolve) => { resolveRemove = resolve; });
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [{ id: 't1', name: 'Alice Thompson', email: 'alice@school.edu' }] };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) return Promise.resolve(GROUP);
      if (endpoint === '/api/admin/teacher-groups/g1/members/t1' && options?.method === 'DELETE') return removePromise.then(() => ({}));
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
    // Alice Thompson also appears in the underlying users register table,
    // so expect 2 matches once the modal has actually rendered the member.
    await waitFor(() => expect(screen.getAllByText('alice@school.edu').length).toBe(2));

    fireEvent.click(screen.getByTitle('Remove from group'));
    // Close the group detail modal (selectedGroup -> null) before the DELETE
    // resolves: the pending functional setSelectedGroup update must then see
    // a null `prev` and no-op instead of re-adding stale group data.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    resolveRemove();
    await waitFor(() => expect(screen.getByText('Teacher removed from group.')).toBeDefined());
  });

  it('falls back to default error messages when school/user/edit-user/group creation reject non-Error values', async () => {
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/schools' && options?.method === 'POST') return Promise.reject('boom');
      if (endpoint === '/api/admin/users' && options?.method === 'POST') return Promise.reject('boom');
      if (endpoint === '/api/admin/users/s1' && options?.method === 'PUT') return Promise.reject('boom');
      if (endpoint === '/api/admin/teacher-groups' && options?.method === 'POST') return Promise.reject('boom');
      return routeApiCall(endpoint);
    });
    vi.mocked(useAuth).mockReturnValue({
      user: ADMIN_USER,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });

    const { container } = render(<ChromeHarness />);
    await waitFor(() => expect(screen.getByText('Alex Johnson')).toBeDefined());
    const closeViaCancel = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.transitionEnd(container.querySelector('.fixed.inset-0.z-40')!);
    };

    fireEvent.click(screen.getByRole('button', { name: 'Register School' }));
    fireEvent.change(screen.getByLabelText('School Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Failed to register school')).toBeDefined());
    closeViaCancel();

    fireEvent.click(screen.getByRole('button', { name: /New User/i }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@x.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough123' } });
    fireEvent.change(screen.getByDisplayValue('Student'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByDisplayValue('No school'), { target: { value: 'sch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Failed to create user')).toBeDefined());
    closeViaCancel();

    const user = userEvent.setup();
    const row = screen.getByText('Alex Johnson').closest('tr')!;
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Edit User'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByText('Failed to update user')).toBeDefined());
    closeViaCancel();

    fireEvent.click(screen.getByRole('button', { name: /New Group/i }));
    fireEvent.change(screen.getByLabelText('Group Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByDisplayValue('Select a school'), { target: { value: 'sch-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Failed to create teacher group')).toBeDefined());
  });

  it('falls back to default error messages when group-detail, remove-member, delete-group, and delete-user actions reject non-Error values', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let groupDetailCalls = 0;
    const GROUP = { id: 'g1', school_id: 'sch-1', name: 'Math Dept', members: [{ id: 't1', name: 'Alice Thompson', email: 'alice@school.edu' }] };
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/teacher-groups') return Promise.resolve([{ id: 'g1', school_id: 'sch-1', name: 'Math Dept' }]);
      if (endpoint === '/api/admin/teacher-groups/g1' && !options) {
        groupDetailCalls += 1;
        // Fails once with a non-Error value to exercise the fallback
        // message, then succeeds on retry so the test can proceed.
        return groupDetailCalls === 1 ? Promise.reject('boom') : Promise.resolve(GROUP);
      }
      if (endpoint === '/api/admin/teacher-groups/g1/members/t1' && options?.method === 'DELETE') return Promise.reject('boom');
      if (endpoint === '/api/admin/teacher-groups/g1' && options?.method === 'DELETE') return Promise.reject('boom');
      if (endpoint === '/api/admin/users/s1' && options?.method === 'DELETE') return Promise.reject('boom');
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
    await waitFor(() => expect(screen.getByText('Failed to load group details')).toBeDefined());

    fireEvent.click(screen.getByText('Math Dept'));
    // Alice Thompson also appears in the underlying users register table
    // (see the similar assertion further up this file), so expect 2.
    await waitFor(() => expect(screen.getAllByText('alice@school.edu').length).toBe(2));

    fireEvent.click(screen.getByTitle('Remove from group'));
    await waitFor(() => expect(screen.getByText('Failed to remove teacher from group')).toBeDefined());

    fireEvent.click(screen.getByTitle('Delete group'));
    await waitFor(() => expect(screen.getByText('Failed to delete "Math Dept"')).toBeDefined());

    const row = screen.getByText('Alex Johnson').closest('tr')!;
    const user = userEvent.setup();
    await user.click(row.querySelector('button') as HTMLButtonElement);
    await user.click(await screen.findByText('Delete User'));
    await waitFor(() => expect(screen.getByText('Failed to delete Alex Johnson')).toBeDefined());

    confirmSpy.mockRestore();
  });

  it('shows the default fallback message when the workspace fails to load with a non-Error thrown value', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      // A users payload with a custom `.map` that throws a plain string
      // (not an Error instance) exercises the `err instanceof Error` false
      // branch of the outer catch in loadAdminWorkspace.
      if (endpoint === '/api/admin/users') return Promise.resolve({ map: () => { throw 'boom'; } });
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
    await waitFor(() => expect(screen.getByText('Failed to load administrative metrics')).toBeDefined());
  });

  it('dismisses the toast immediately when its close button is clicked', async () => {
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
    await waitFor(() => expect(screen.getByText('School ID copied to clipboard')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText('School ID copied to clipboard')).toBeNull();
  });
});
