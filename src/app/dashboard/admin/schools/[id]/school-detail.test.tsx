// Tests for: src/app/dashboard/admin/schools/[id]/page.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SchoolDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';

const mockPush = vi.fn();
const mockApiCall = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sch-1' }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../DashboardLayoutContext', () => ({
  useDashboardLayout: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

const ADMIN_USER = {
  id: 'admin-1',
  name: 'Sarah Chen',
  email: 'sarah.chen@university.edu',
  role: 'admin' as const,
  school_id: null,
};

const USERS = [
  { id: 'teacher-1', name: 'Alice Thompson', email: 'alice@school.edu', role: 'teacher', school_id: 'sch-1', is_suspended: false },
  { id: 'teacher-2', name: 'Bob Miller', email: 'bob@school.edu', role: 'teacher', school_id: 'sch-1', is_suspended: false },
  { id: 'student-1', name: 'Alex Johnson', email: 'alex@school.edu', role: 'student', school_id: 'sch-1', is_suspended: false },
  { id: 'student-2', name: 'Maya Patel', email: 'maya@school.edu', role: 'student', school_id: 'sch-1', is_suspended: true },
];

const CLASSES = [
  { id: 'class-1', school_id: 'sch-1', teacher_id: 'teacher-1', name: 'Biology 101', code: 'BIO-101' },
  { id: 'class-2', school_id: 'sch-1', teacher_id: 'teacher-2', name: 'Chemistry 101', code: 'CHEM-101' },
  { id: 'other-class', school_id: 'sch-2', teacher_id: 'teacher-2', name: 'Other School Class', code: 'OTH-1' },
];

const ROSTERS = {
  'class-1': [
    { student_id: 'student-1', name: 'Alex Johnson', email: 'alex@school.edu', enrolled_at: '2026-01-01', status: 'active' },
    { student_id: 'student-2', name: 'Maya Patel', email: 'maya@school.edu', enrolled_at: '2026-01-02', status: 'active' },
  ],
  'class-2': [{ student_id: 'student-1', name: 'Alex Johnson', email: 'alex@school.edu', enrolled_at: '2026-01-03', status: 'active' }],
};

function routeApiCall(endpoint: string, options?: RequestInit) {
  if (endpoint === '/api/admin/schools') {
    return Promise.resolve([
      { id: 'sch-1', name: 'Concentrate Academy', created_at: '2026-01-01' },
      { id: 'sch-2', name: 'North Campus', created_at: '2026-01-02' },
    ]);
  }
  if (endpoint === '/api/classes' && options?.method === 'POST') {
    return Promise.resolve({ id: 'class-3', school_id: 'sch-1', teacher_id: 'teacher-1', name: 'Physics 101', code: 'PHY-101' });
  }
  if (endpoint === '/api/classes') return Promise.resolve(CLASSES);
  if (endpoint === '/api/admin/users') return Promise.resolve(USERS);
  if (endpoint === '/api/classes/class-1/students') return Promise.resolve(ROSTERS['class-1']);
  if (endpoint === '/api/classes/class-2/students' && options?.method === 'POST') return Promise.resolve({});
  if (endpoint === '/api/classes/class-2/students') return Promise.resolve(ROSTERS['class-2']);
  if (endpoint === '/api/classes/class-1/students/student-1' && options?.method === 'DELETE') return Promise.resolve({});
  if (endpoint === '/api/classes/class-1' && options?.method === 'DELETE') return Promise.resolve({});
  if (endpoint === '/api/admin/users/teacher-1/suspend' && options?.method === 'PATCH') return Promise.resolve({});
  if (endpoint === '/api/admin/users/student-2/suspend' && options?.method === 'PATCH') return Promise.resolve({});
  return Promise.resolve({});
}

function mockAdminSession() {
  vi.mocked(useAuth).mockReturnValue({
    user: ADMIN_USER,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (role) => role === 'admin',
  });
}

function mockLayout() {
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
}

async function renderLoadedPage(implementation: typeof routeApiCall = routeApiCall) {
  mockAdminSession();
  mockLayout();
  mockApiCall.mockImplementation(implementation);
  render(<SchoolDetailPage />);
  await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
}

describe('SchoolDetailPage', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiCall.mockReset();
    mockLayout();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the loading spinner while auth is resolving', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    const { container } = render(<SchoolDetailPage />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('redirects non-admin users back to the dashboard', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'student-1', name: 'Student', email: 'student@school.edu', role: 'student', school_id: 'sch-1' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });

    render(<SchoolDetailPage />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('renders the not-found state when the school id is absent from the catalog', async () => {
    mockAdminSession();
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/schools') return Promise.resolve([]);
      if (endpoint === '/api/classes') return Promise.resolve([]);
      if (endpoint === '/api/admin/users') return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(<SchoolDetailPage />);
    await waitFor(() => expect(screen.getByText('School not found')).toBeDefined());
  });

  it('loads the school dashboard, copies the id, navigates back, and expands rosters', async () => {
    await renderLoadedPage();

    expect(screen.getByText('Classes')).toBeDefined();
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText('Total Students')).toBeDefined();
    expect(screen.getByText('Biology 101')).toBeDefined();
    expect(screen.queryByText('Other School Class')).toBeNull();

    fireEvent.click(screen.getByTitle('Copy School ID'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sch-1');
    await waitFor(() => expect(screen.getByText('School ID copied to clipboard')).toBeDefined());

    fireEvent.click(screen.getByText('Back to Administration Desk'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/admin');

    fireEvent.click(screen.getByText('Biology 101'));
    expect(screen.getByText('Alex Johnson')).toBeDefined();
    expect(screen.getByText('Maya Patel')).toBeDefined();
  });

  it('creates a class only after valid input and handles create failures', async () => {
    await renderLoadedPage();

    fireEvent.click(screen.getByText('New Class'));
    expect(screen.getByText('Create New Class')).toBeDefined();
    expect(screen.getByText('Create Class')).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByPlaceholderText('e.g. CS102 - Data Structures'), { target: { value: 'Physics 101' } });
    fireEvent.change(screen.getByDisplayValue('Select a teacher...'), { target: { value: 'teacher-1' } });
    fireEvent.click(screen.getByText('Create Class'));

    await waitFor(() => expect(screen.getByText('Class "Physics 101" created.')).toBeDefined());
    expect(mockApiCall).toHaveBeenCalledWith('/api/classes', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ school_id: 'sch-1', name: 'Physics 101', teacher_id: 'teacher-1' }),
    }));

    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes' && options?.method === 'POST') return Promise.reject(new Error('Class code collision'));
      return routeApiCall(endpoint, options);
    });
    fireEvent.click(screen.getByText('New Class'));
    fireEvent.change(screen.getByPlaceholderText('e.g. CS102 - Data Structures'), { target: { value: 'Physics 102' } });
    fireEvent.change(screen.getByDisplayValue('Select a teacher...'), { target: { value: 'teacher-1' } });
    fireEvent.click(screen.getByText('Create Class'));

    await waitFor(() => expect(screen.getByText('Class code collision')).toBeDefined());
  });

  it('deletes classes only after confirmation and reports default errors', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    await renderLoadedPage();

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByTitle('Delete class')[0]);
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/classes/class-1', expect.objectContaining({ method: 'DELETE' }));

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getAllByTitle('Delete class')[0]);
    await waitFor(() => expect(screen.getByText('Class "Biology 101" deleted.')).toBeDefined());

    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/class-2' && options?.method === 'DELETE') return Promise.reject('offline');
      return routeApiCall(endpoint, options);
    });
    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getAllByTitle('Delete class')[0]);
    await waitFor(() => expect(screen.getByText('Failed to delete "Chemistry 101"')).toBeDefined());
  });

  it('suspends and reactivates staff and students, including API errors', async () => {
    await renderLoadedPage();

    fireEvent.click(screen.getAllByTitle('Suspend teacher')[0]);
    await waitFor(() => expect(screen.getByText('Alice Thompson suspended successfully.')).toBeDefined());

    fireEvent.click(screen.getByText('Biology 101'));
    fireEvent.click(screen.getByTitle('Reactivate student'));
    await waitFor(() => expect(screen.getByText('Maya Patel reactivated successfully.')).toBeDefined());

    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/users/teacher-1/suspend' && options?.method === 'PATCH') return Promise.reject('offline');
      return routeApiCall(endpoint, options);
    });
    fireEvent.click(screen.getAllByTitle('Reactivate teacher')[0]);
    await waitFor(() => expect(screen.getByText('Failed to update Alice Thompson')).toBeDefined());
  });

  it('moves and removes students without leaving stale roster rows', async () => {
    await renderLoadedPage();
    fireEvent.click(screen.getByText('Biology 101'));

    const alexRow = screen.getByText('Alex Johnson').closest('div')!.parentElement!;
    fireEvent.click(alexRow.querySelector('button[title="Move to selected class"]') as HTMLButtonElement);
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/classes/class-2/students', expect.anything());

    fireEvent.change(alexRow.querySelector('select') as HTMLSelectElement, { target: { value: 'class-2' } });
    fireEvent.click(alexRow.querySelector('button[title="Move to selected class"]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('Alex Johnson moved to "Chemistry 101".')).toBeDefined());

    fireEvent.click(screen.getByTitle('Remove from class'));
    await waitFor(() => expect(screen.getByText('Maya Patel removed from class.')).toBeDefined());
    expect(screen.queryByText('Maya Patel')).toBeNull();
  });

  it('shows fallback errors when roster, move, and remove operations fail', async () => {
    mockAdminSession();
    mockLayout();
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/admin/schools') return Promise.resolve([{ id: 'sch-1', name: 'Concentrate Academy', created_at: '2026-01-01' }]);
      if (endpoint === '/api/classes') return Promise.resolve([{ id: 'class-1', school_id: 'sch-1', teacher_id: 'teacher-1', name: 'Biology 101', code: 'BIO-101' }]);
      if (endpoint === '/api/admin/users') return Promise.resolve(USERS);
      if (endpoint === '/api/classes/class-1/students' && !options) return Promise.reject('offline');
      return Promise.resolve({});
    });

    render(<SchoolDetailPage />);
    await waitFor(() => expect(screen.getByText('Concentrate Academy')).toBeDefined());
    fireEvent.click(screen.getByText('Biology 101'));
    expect(screen.getByText('No students enrolled in this class yet.')).toBeDefined();

    cleanup();
    await renderLoadedPage((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/class-2/students' && options?.method === 'POST') return Promise.reject('already enrolled');
      if (endpoint.includes('/students/') && options?.method === 'DELETE') return Promise.reject('delete failed');
      return routeApiCall(endpoint, options);
    });
    fireEvent.click(screen.getByText('Biology 101'));

    fireEvent.change(screen.getAllByDisplayValue('Move to...')[0], { target: { value: 'class-2' } });
    fireEvent.click(screen.getAllByTitle('Move to selected class')[0]);
    await waitFor(() => expect(screen.getByText(/Failed to move/)).toBeDefined());

    fireEvent.click(screen.getAllByTitle('Remove from class')[0]);
    await waitFor(() => expect(screen.getByText(/Failed to remove/)).toBeDefined());
  });

  it('warns when no teachers are assigned to the selected school', async () => {
    mockAdminSession();
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/admin/schools') return Promise.resolve([{ id: 'sch-1', name: 'Concentrate Academy', created_at: '2026-01-01' }]);
      if (endpoint === '/api/classes') return Promise.resolve([]);
      if (endpoint === '/api/admin/users') return Promise.resolve([{ ...USERS[0], school_id: 'sch-2' }]);
      return Promise.resolve([]);
    });

    render(<SchoolDetailPage />);
    await waitFor(() => expect(screen.getByText('No classes have been created at this school yet.')).toBeDefined());
    fireEvent.click(screen.getByText('New Class'));
    expect(screen.getByText('No teachers are assigned to this school yet - create a teacher user first.')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create New Class')).toBeNull();
  });
});
