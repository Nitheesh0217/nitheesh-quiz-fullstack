// Tests for: src/components/ChatWidget.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { ChatWidget, formatMessage } from './ChatWidget';
import { useAuth } from './AuthProvider';
import { refreshAccessToken } from '@/lib/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const STUDENT = {
  id: 'student-1',
  name: 'Alex Johnson',
  role: 'student' as const,
  email: 'alex.johnson@university.edu',
  school_id: 'school-1',
};

function sseResponse(dataLines: string[]) {
  const text = dataLines.map((l) => `data: ${l}`).join('\n') + '\ndata: [DONE]\n';
  const encoder = new TextEncoder();
  let served = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (!served) {
              served = true;
              return { done: false, value: encoder.encode(text) };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  } as unknown as Response;
}

// Mock AuthProvider hook
vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock the shared token-refresh helper so 401-retry tests control it directly.
vi.mock('@/lib/api', () => ({
  refreshAccessToken: vi.fn(),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock window.HTMLElement.prototype.scrollIntoView since jsdom doesn't support it
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ChatWidget Component', () => {
  it('should render nothing if user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });
    const { container } = render(<ChatWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('should render floating chat toggle button when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'student-1',
        name: 'Alex Johnson',
        role: 'student',
        email: 'alex.johnson@university.edu',
        school_id: 'school-1',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<ChatWidget />);
    // Toggle button should be present
    const toggleBtn = screen.getByRole('button');
    expect(toggleBtn).toBeDefined();
  });

  it('should open the chat panel when toggle button is clicked', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'student-1',
        name: 'Alex Johnson',
        role: 'student',
        email: 'alex.johnson@university.edu',
        school_id: 'school-1',
      },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<ChatWidget />);
    const toggleBtn = screen.getByRole('button');
    
    // Panel should not be visible initially
    expect(screen.queryByText('Concentrate AI')).toBeNull();

    // Click to open
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Concentrate AI')).toBeDefined();

    // Verify starter questions for student are displayed
    expect(screen.getByText('What assignments do I have due?')).toBeDefined();
    expect(screen.getByText('What are my current grades?')).toBeDefined();
    expect(screen.getByText('How do I submit an assignment?')).toBeDefined();
  });

  it('closes the chat panel when the header close button is clicked', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Concentrate AI')).toBeDefined();

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // header X close button
    expect(screen.queryByText('Concentrate AI')).toBeNull();
  });

  it('shows teacher starter questions for the teacher role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...STUDENT, role: 'teacher' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'teacher',
    });
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('How do I publish an assignment?')).toBeDefined();
  });

  it('shows admin starter questions for the admin role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...STUDENT, role: 'admin' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'admin',
    });
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Show me platform stats')).toBeDefined();
  });

  it('streams a response and appends it to the assistant message', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue(
      sseResponse([JSON.stringify({ content: 'Hello there' })])
    );

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() => expect(screen.getByText('Hello there')).toBeDefined());
  });

  it('renders a navigate action button and calls router.push when clicked', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ content: 'Here you go' }),
        JSON.stringify({ action: { type: 'navigate', path: '/dashboard/student/grades', label: 'View Grades' } }),
      ])
    );

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    const actionBtn = await screen.findByText('View Grades');
    fireEvent.click(actionBtn);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/student/grades');
  });

  it('shows a rate-limit message on a 429 response', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() =>
      expect(screen.getByText('Rate limit exceeded. Please wait a moment and try again.')).toBeDefined()
    );
  });

  it('transparently refreshes an expired access token on a 401 and retries once', async () => {
    // Regression test: a chat sent after the short-lived access token expired
    // used to just fail with a generic "trouble connecting" error, unlike
    // every other request in the app which auto-refreshes and retries.
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    vi.mocked(refreshAccessToken).mockResolvedValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce(sseResponse([JSON.stringify({ content: 'Recovered reply' })]));
    global.fetch = fetchMock;

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() => expect(screen.getByText('Recovered reply')).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('shows the generic error message when a 401 refresh attempt fails', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    vi.mocked(refreshAccessToken).mockResolvedValue(false);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchMock;

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() =>
      expect(screen.getByText("I'm having trouble connecting right now. Please try again in a moment.")).toBeDefined()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows a generic error message when the API returns a non-429 error', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() =>
      expect(screen.getByText("I'm having trouble connecting right now. Please try again in a moment.")).toBeDefined()
    );
  });

  it('shows a generic error message when the response body is not readable', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null });

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() =>
      expect(screen.getByText("I'm having trouble connecting right now. Please try again in a moment.")).toBeDefined()
    );
  });

  it('shows a generic error message when the fetch call itself rejects', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('What are my current grades?'));

    await waitFor(() =>
      expect(screen.getByText("I'm having trouble connecting right now. Please try again in a moment.")).toBeDefined()
    );
  });

  it('ignores empty input and does not send while already streaming', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([JSON.stringify({ content: 'x' })]));
    global.fetch = fetchMock;

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByPlaceholderText('Ask a question...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits typed input through the form', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: STUDENT,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (r) => r === 'student',
    });
    global.fetch = vi.fn().mockResolvedValue(sseResponse([JSON.stringify({ content: 'Reply' })]));

    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button'));

    const input = screen.getByPlaceholderText('Ask a question...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hi there' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(screen.getByText('Reply')).toBeDefined());
  });
});

describe('formatMessage', () => {
  it('returns null for empty content', () => {
    expect(formatMessage('')).toBeNull();
  });

  it('renders bullet points, bold text, and inline code', () => {
    render(<div>{formatMessage('**Bold** intro\n- bullet one\n* bullet two\nSome `inline` code')}</div>);
    expect(screen.getByText('Bold')).toBeDefined();
    expect(screen.getByText('bullet one')).toBeDefined();
    expect(screen.getByText('bullet two')).toBeDefined();
    expect(screen.getByText('inline')).toBeDefined();
  });

  it('renders a fenced code block with a language label', () => {
    const { container } = render(<div>{formatMessage('```js\nconsole.log(1)\n```')}</div>);
    expect(container.querySelector('pre')).not.toBeNull();
    expect(screen.getByText('js')).toBeDefined();
    expect(screen.getByText('console.log(1)')).toBeDefined();
  });

  it('renders a malformed fenced code block by stripping the fences directly', () => {
    const { container } = render(<div>{formatMessage('```abc```')}</div>);
    expect(container.querySelector('pre')).not.toBeNull();
    expect(screen.getByText('abc')).toBeDefined();
  });

  it('strips stray markdown links to just their label text', () => {
    render(<div>{formatMessage('See [the docs](https://example.com) for more')}</div>);
    expect(screen.getByText(/See the docs for more/)).toBeDefined();
  });
});
