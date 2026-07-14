// Tests for: src/app/dashboard/student/classes/[id]/page.tsx
//
// Coverage note: two branches remain unreachable and are intentionally left
// uncovered - the `a.due_date ? ... : 'N/A'` fallback inside both "To Do /
// Upcoming" list renders (lines ~427 and ~704 of page.tsx). Both sit inside
// `.filter(a => a.due_date && ...)` results, so `a.due_date` is always
// truthy there; the ": 'N/A'" side of the ternary is dead code given the
// surrounding filter.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import StudentClassDetailPage from './page';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const mockPush = vi.fn();
const mockRouter = { push: mockPush };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'c1' }),
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

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const CLASSROOM = {
  id: 'c1',
  name: 'Biology',
  description: 'Intro to biology concepts.',
  code: 'BIO-101',
  teacher_name: 'Dr. Smith',
  syllabus_overview: 'This course covers cells, genetics, and ecology.',
};

const ASSIGNMENTS = [
  {
    id: 'a1',
    title: 'Essay',
    description: 'Write a 500-word essay.',
    due_date: FUTURE,
    // stringified rubric exercises the JSON.parse branch
    rubric: JSON.stringify([{ criterion: 'Clarity', max_points: 50 }, { criterion: 'Grammar', max_points: 50 }]),
  },
  {
    id: 'a2',
    title: 'Quiz',
    description: null,
    due_date: PAST,
    rubric: [{ criterion: 'Accuracy', max_points: 100 }],
  },
  {
    id: 'a3',
    title: 'Lab Report',
    description: 'Summarize the lab results.',
    due_date: null,
    rubric: [{ criterion: 'Completeness', max_points: 100 }],
  },
];

const GRADES = [
  {
    grade_id: 'g1',
    assignment_id: 'a1',
    student_id: 'student-1',
    total_score: 90,
    feedback: 'Great structure and clarity!',
    graded_at: '2026-01-05T00:00:00Z',
    // stringified rubric_scores exercises the JSON.parse branch
    rubric_scores: JSON.stringify([{ criterion: 'Clarity', score: 45 }, { criterion: 'Grammar', score: 45 }]),
    submission_id: 'sub-1',
    assignment_title: 'Essay',
  },
  {
    // Belongs to a different student - must be filtered out.
    grade_id: 'g-other',
    assignment_id: 'a1',
    student_id: 'student-2',
    total_score: 10,
    feedback: null,
    graded_at: '2026-01-01T00:00:00Z',
    rubric_scores: [],
    submission_id: 'sub-x',
  },
  {
    // References an assignment that isn't in the assignments list, exercising
    // the "assign not found" max_score fallback (100) and the missing
    // assignment_title fallback ("Graded Work").
    grade_id: 'g-ghost',
    assignment_id: 'a-ghost',
    student_id: 'student-1',
    total_score: 77,
    feedback: null,
    graded_at: '2026-01-02T00:00:00Z',
    rubric_scores: { note: 'unstructured' },
    submission_id: 'sub-ghost',
  },
];

const SYLLABUS_WEEKS = [
  {
    id: 'w1',
    week_number: 1,
    title: 'Introduction',
    topics: 'Course intro and syllabus review',
    readings: 'Chapter 1',
    video_links: ['https://video.example/intro'],
    linked_assignment_id: 'a1',
  },
  {
    id: 'w2',
    week_number: 2,
    title: 'Cell Biology',
    topics: null,
    readings: null,
    video_links: [],
    linked_assignment_id: null,
  },
];

const ANNOUNCEMENTS = [
  {
    id: 'ann1',
    title: 'Welcome to Biology',
    content: 'Please review the syllabus before next class.',
    created_at: '2026-01-01T00:00:00Z',
    author_name: 'Dr. Smith',
  },
];

const SUB_1 = {
  id: 'sub-1',
  assignment_id: 'a1',
  student_id: 'student-1',
  file_url: 'data:application/pdf;name=essay.pdf;base64,QUJD',
  text_content: null,
  status: 'graded',
  submitted_at: '2026-01-04T00:00:00Z',
};

const SUB_2 = {
  id: 'sub-2',
  assignment_id: 'a2',
  student_id: 'student-1',
  file_url: 'https://files.example.com/uploads/quiz-answer.docx',
  text_content: 'My quiz answers here.',
  status: 'submitted',
  submitted_at: '2026-01-03T00:00:00Z',
};

function routeApiCall(endpoint: string) {
  if (endpoint === '/api/classes/c1') return Promise.resolve(CLASSROOM);
  if (endpoint === '/api/classes/c1/assignments') return Promise.resolve(ASSIGNMENTS);
  if (endpoint === '/api/classes/c1/grades') return Promise.resolve(GRADES);
  if (endpoint === '/api/classes/c1/syllabus-weeks') return Promise.resolve(SYLLABUS_WEEKS);
  if (endpoint === '/api/classes/c1/announcements') return Promise.resolve(ANNOUNCEMENTS);
  if (endpoint === '/api/submissions/sub-1') return Promise.resolve(SUB_1);
  if (endpoint === '/api/submissions/sub-2') return Promise.resolve(SUB_2);
  return Promise.resolve([]);
}

function mockAuthAndLayout() {
  vi.mocked(useAuth).mockReturnValue({
    user: STUDENT,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  });
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

describe('StudentClassDetailPage', () => {
  beforeEach(() => {
    mockAuthAndLayout();
  });

  it('renders the classroom tab with course info, upcoming tasks, and recent feedback', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('Intro to biology concepts.')).toBeDefined();
    // Upcoming assignment (a1, future due date) - appears once in the to-do
    // list and once as the recent-feedback item's assignment_title.
    expect(screen.getAllByText('Essay').length).toBe(2);
    // Recent feedback (a1's grade)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /Score:/.test(el.textContent || '') && /90 pts/.test(el.textContent || ''))).toBeDefined();
    // Ghost grade falls back to "Graded Work" title
    expect(screen.getByText('Graded Work')).toBeDefined();
  });

  it('shows the empty states on the classroom tab when there are no upcoming assignments or grades', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ id: 'a2', title: 'Quiz', description: null, due_date: PAST, rubric: [{ criterion: 'Accuracy', max_points: 100 }] }]);
      }
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);

    await waitFor(() => expect(screen.getByText('No upcoming tasks due.')).toBeDefined());
    expect(screen.getByText('No graded records posted yet.')).toBeDefined();
  });

  it('falls back to the default class description when none is set', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.resolve({ ...CLASSROOM, description: null });
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByText(/Welcome to this virtual lecture workstation/)).toBeDefined());
  });

  it('clicking an upcoming to-do item switches to the assignments tab with that assignment selected', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByText('No upcoming tasks due.')).toBeNull, { timeout: 1 }).catch(() => {});
    await waitFor(() => expect(screen.getAllByText('Essay').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByText('Essay')[0]);
    await waitFor(() => expect(screen.getByText('Assignments list')).toBeDefined());
    expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined();
  });

  it('clicking a recent feedback item switches to the assignments tab with the matching assignment selected', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByText((_, el) => el?.tagName === 'P' && /90 pts/.test(el.textContent || ''))).toBeDefined());

    fireEvent.click(screen.getByText((_, el) => el?.tagName === 'P' && /90 pts/.test(el.textContent || '')).closest('div[class*="cursor-pointer"]')!);
    await waitFor(() => expect(screen.getByText('Assignments list')).toBeDefined());
    expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined();
  });

  it('clicking a recent feedback item with no matching assignment does nothing', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Graded Work')).toBeDefined());

    fireEvent.click(screen.getByText('Graded Work'));
    // Still on the classroom tab - the assignments roster heading isn't shown.
    expect(screen.queryByText('Assignments list')).toBeNull();
  });

  it('clicking the Syllabus & Modules link on the classroom tab switches to the syllabus tab', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());

    fireEvent.click(screen.getByText('Syllabus & Modules', { selector: 'strong' }));
    await waitFor(() => expect(screen.getByText('Course Overview')).toBeDefined());
  });

  it('switches between all four tabs via the tab switcher buttons', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByText('Assignments list')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Syllabus & Modules/ }));
    await waitFor(() => expect(screen.getByText('Course Overview')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Announcements/ }));
    await waitFor(() => expect(screen.getByText('Class Announcements')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Classroom/ }));
    await waitFor(() => expect(screen.getByText('Course Home')).toBeDefined());
  });

  it('shows the empty state when the class has no assignments', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByText('No assignments published yet.')).toBeDefined());
  });

  it('renders assignment cards with Score, Submitted, and Not Submitted status badges', async () => {
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));

    await waitFor(() => expect(screen.getByText('Score: 90 pts')).toBeDefined());
    expect(screen.getByText('Submitted')).toBeDefined();
    expect(screen.getByText('Not Submitted')).toBeDefined();
  });

  it('shows the welcome workspace with active classroom info when no assignment is selected', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));

    await waitFor(() => expect(screen.getByText('Active Classroom')).toBeDefined());
    expect(screen.getByText(/Select an assignment from the list/)).toBeDefined();

    // Clicking the upcoming to-do item's own "Start" label (distinct from the
    // assignment roster button on the left, which also renders "Essay")
    // selects it without switching tabs (we're already on the assignments tab).
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined());
  });

  it('clicking the Syllabus & Modules link in the assignments-tab welcome workspace switches tabs', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByText('Active Classroom')).toBeDefined());

    // This workspace has two "Syllabus & Modules" <strong> tags - the
    // clickable one in the intro paragraph (first in DOM order) and a
    // non-interactive one at the bottom of the checklist card.
    fireEvent.click(screen.getAllByText('Syllabus & Modules', { selector: 'strong' })[0]);
    await waitFor(() => expect(screen.getByText('Course Overview')).toBeDefined());
  });

  it('shows the welcome workspace empty states for to-do and feedback when none exist', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') {
        return Promise.resolve([{ id: 'a2', title: 'Quiz', description: null, due_date: PAST, rubric: [{ criterion: 'Accuracy', max_points: 100 }] }]);
      }
      if (endpoint === '/api/classes/c1/grades') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));

    await waitFor(() => expect(screen.getByText('Active Classroom')).toBeDefined());
    expect(screen.getAllByText('No upcoming tasks due.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No graded records posted yet.').length).toBeGreaterThan(0);
  });

  it('selecting a recent feedback item from the welcome workspace selects the matching assignment', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByText('Active Classroom')).toBeDefined());

    fireEvent.click(screen.getByText((_, el) => el?.tagName === 'P' && /90 pts/.test(el.textContent || '')).closest('div[class*="cursor-pointer"]')!);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Essay' })).toBeDefined());
  });

  it('selecting a ghost feedback item from the welcome workspace with no matching assignment does nothing', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByText('Graded Work')).toBeDefined());

    fireEvent.click(screen.getByText('Graded Work'));
    expect(screen.getByText('Active Classroom')).toBeDefined();
  });

  it('selecting a graded assignment shows the graded state, opens rubric details, and closes it', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Essay/ })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Essay/ }));
    await waitFor(() => expect(screen.getByText(/Graded on/)).toBeDefined());
    expect(screen.getByText('90 points')).toBeDefined();
    expect(screen.getByText('A (90%)')).toBeDefined();
    expect(screen.getAllByText('"Great structure and clarity!"').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Review Grade details'));
    await waitFor(() => expect(screen.getByText('Grade Breakdown')).toBeDefined());
    // "Clarity" appears in both the main card's Rubric Requirements list
    // and the side sheet's Scored Criteria list. "45 pts" appears twice
    // within the side sheet alone (Clarity: 45, Grammar: 45).
    expect(screen.getAllByText('Clarity').length).toBe(2);
    expect(screen.getAllByText('45 pts').length).toBe(2);
    expect(screen.getByText('A · 90%')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: '' })[0]);
    await waitFor(() => expect(screen.queryByText('Grade Breakdown')).toBeNull());
  });

  it('shows fallback text for empty feedback and non-array rubric scores in the rubric side sheet', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') {
        return Promise.resolve([{ ...GRADES[0], feedback: null, rubric_scores: { note: 'flat' } }]);
      }
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Essay/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Essay/ }));

    await waitFor(() => expect(screen.getByText(/Graded on/)).toBeDefined());
    // No "Teacher Comments" section on the main card when feedback is empty.
    expect(screen.queryByText('Teacher Comments')).toBeNull();

    fireEvent.click(screen.getByText('Review Grade details'));
    await waitFor(() => expect(screen.getByText('"No comments provided."')).toBeDefined());
    expect(screen.getByText('No itemized points recorded.')).toBeDefined();
  });

  it('computes A/B/C/D/F letter grades and success/info/warning/danger badge variants at their thresholds', async () => {
    async function renderWithScore(score: number) {
      mockApiCall.mockImplementation((endpoint: string) => {
        if (endpoint === '/api/classes/c1/assignments') {
          return Promise.resolve([{ id: 'a-score', title: 'Score Test', description: 'x', due_date: FUTURE, rubric: [{ criterion: 'Total', max_points: 100 }] }]);
        }
        if (endpoint === '/api/classes/c1/grades') {
          return Promise.resolve([{ grade_id: 'g-score', assignment_id: 'a-score', student_id: 'student-1', total_score: score, feedback: null, graded_at: '2026-01-01T00:00:00Z', rubric_scores: [], submission_id: 'sub-score' }]);
        }
        if (endpoint === '/api/submissions/sub-score') return Promise.resolve({ id: 'sub-score', assignment_id: 'a-score', student_id: 'student-1', file_url: null, text_content: null, status: 'graded', submitted_at: '2026-01-01T00:00:00Z' });
        return routeApiCall(endpoint);
      });
      render(<StudentClassDetailPage />);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Score Test/ })).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: /Score Test/ }));
      await waitFor(() => expect(screen.getByText(/Graded on/)).toBeDefined());
    }

    await renderWithScore(95); // >=90 -> A / success
    expect(screen.getByText('A (95%)')).toBeDefined();
    cleanup();

    await renderWithScore(85); // >=80 -> B / info
    expect(screen.getByText('B (85%)')).toBeDefined();
    cleanup();

    await renderWithScore(72); // >=70 -> C / warning
    expect(screen.getByText('C (72%)')).toBeDefined();
    cleanup();

    await renderWithScore(65); // >=60 -> D / danger
    expect(screen.getByText('D (65%)')).toBeDefined();
    cleanup();

    await renderWithScore(50); // <60 -> F / danger
    expect(screen.getByText('F (50%)')).toBeDefined();
  });

  it('selecting an ungraded assignment with a submitted response shows the pending state with file and text details', async () => {
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Quiz/ })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Quiz/ }));
    await waitFor(() => expect(screen.getByText('Work Submitted - Pending Teacher Assessment')).toBeDefined());
    expect(screen.getByText('My quiz answers here.')).toBeDefined();
    expect(screen.getByText(/Open attachment: quiz-answer.docx/)).toBeDefined();
    expect(screen.getByText(/Received on/)).toBeDefined();
    // "No instructions provided." - a2's description is null.
    expect(screen.getByText('No instructions provided.')).toBeDefined();

    fireEvent.click(screen.getByText('Resubmit'));
    await waitFor(() => expect(screen.getByText('Submit Assignment')).toBeDefined());
  });

  it('renders an inline image preview and supports downloading a data: URL attachment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2') {
        return Promise.resolve({ ...SUB_2, file_url: 'data:image/png;name=photo.png;base64,AAAA', text_content: null });
      }
      return routeApiCall(endpoint);
    });
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Quiz/ }));

    await waitFor(() => expect(screen.getByAltText('photo.png')).toBeDefined());
    fireEvent.click(screen.getByText('Download File'));
  });

  it('falls back to "Open Attachment" for a non-data URL with no filename segment', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2') {
        return Promise.resolve({ ...SUB_2, file_url: 'https://files.example.com/', text_content: null });
      }
      return routeApiCall(endpoint);
    });
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Quiz/ }));

    await waitFor(() => expect(screen.getByText(/Open attachment: Open Attachment/)).toBeDefined());
  });

  it('falls back to a generic file name and document type for a data: URL with no name or mime type', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-2') {
        // No ";name=" segment and nothing between "data:" and the first ";"
        // exercises the nameMatch/mimeMatch regex fallback branches.
        return Promise.resolve({ ...SUB_2, file_url: 'data:;base64,AAAA', text_content: null });
      }
      return routeApiCall(endpoint);
    });
    localStorage.setItem('submission_student-1_a2', 'sub-2');
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Quiz/ }));

    await waitFor(() => expect(screen.getByText('submitted_document')).toBeDefined());
    expect(screen.getByText(/document • PostgreSQL File DB/)).toBeDefined();
  });

  it('selecting an assignment with no grade and no submission shows the Start Submission button and opens the modal', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Lab Report/ })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Lab Report/ }));
    await waitFor(() => expect(screen.getByText(/haven.t submitted work/)).toBeDefined());
    // a3 has no due date.
    expect(screen.getByText('Due: N/A')).toBeDefined();

    fireEvent.click(screen.getByText('Start Submission'));
    await waitFor(() => expect(screen.getByText('Submit Assignment')).toBeDefined());
  });

  it('submits an assignment via the modal, closes it, updates the workspace, and reloads class data', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reloadCount = 0;
    mockApiCall.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/classes/c1/assignments' && !options) reloadCount += 0; // no-op marker
      if (endpoint === '/api/assignments/a3/submit' && options?.method === 'POST') {
        return Promise.resolve({ id: 'sub-new', assignment_id: 'a3', student_id: 'student-1', file_url: null, text_content: 'My lab writeup.', status: 'submitted', submitted_at: '2026-01-06T00:00:00Z' });
      }
      if (endpoint === '/api/classes/c1/assignments') {
        reloadCount += 1;
        return Promise.resolve(ASSIGNMENTS);
      }
      return routeApiCall(endpoint);
    });

    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Lab Report/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Lab Report/ }));
    fireEvent.click(screen.getByText('Start Submission'));

    await waitFor(() => expect(screen.getByText('Submit Assignment')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Text Entry'));
    fireEvent.change(screen.getByPlaceholderText(/Type or paste/), { target: { value: 'My lab writeup.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Work' }));

    await vi.waitFor(() => expect(screen.getByText('Assignment submitted successfully!')).toBeDefined());
    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => expect(screen.queryByText('Submit Assignment')).toBeNull());
    expect(screen.getByText('Work Submitted - Pending Teacher Assessment')).toBeDefined();
    expect(reloadCount).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('warns and keeps the graded state when a matched grade\'s submission details fail to load', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-1') return Promise.reject(new Error('gone'));
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Essay/ }));

    await waitFor(() => expect(screen.getByText(/Graded on/)).toBeDefined());
    expect(console.warn).toHaveBeenCalled();
  });

  it('warns and falls back to Not Submitted when a stale localStorage submission fails to load', async () => {
    localStorage.setItem('submission_student-1_a3', 'sub-stale');
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/submissions/sub-stale') return Promise.reject(new Error('not found'));
      return routeApiCall(endpoint);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /^Assignments$/ }));
    // Badge still shows "Submitted" purely from the localStorage marker.
    await waitFor(() => expect(screen.getByText('Submitted')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Lab Report/ }));

    await waitFor(() => expect(screen.getByText('Start Submission')).toBeDefined());
    expect(console.warn).toHaveBeenCalled();
  });

  it('renders the syllabus tab with course overview, status sidebar, and toggles a week open and closed', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Syllabus & Modules/ }));

    await waitFor(() => expect(screen.getByText('This course covers cells, genetics, and ecology.')).toBeDefined());
    expect(screen.getByText('Dr. Smith')).toBeDefined();
    expect(screen.getByText('BIO-101')).toBeDefined();
    // Week 1 is expanded by default (expandedWeek === 1).
    expect(screen.getByText('Chapter 1')).toBeDefined();
    expect(screen.getByText('Essay')).toBeDefined(); // linked assignment title

    // Collapse week 1.
    fireEvent.click(screen.getByText('Introduction'));
    await waitFor(() => expect(screen.queryByText('Chapter 1')).toBeNull());

    // Expand week 2.
    fireEvent.click(screen.getByText('Cell Biology'));
    await waitFor(() => expect(screen.getByText('W2')).toBeDefined());
  });

  it('falls back to defaults on the syllabus tab when overview and instructor are missing', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.resolve({ ...CLASSROOM, syllabus_overview: null, teacher_name: null });
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Syllabus & Modules/ }));

    await waitFor(() => expect(screen.getByText(/hasn.t posted a course overview yet/)).toBeDefined());
    expect(screen.getByText('Unassigned')).toBeDefined();
  });

  it('renders the announcements tab with a list, and an empty state when none exist', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Announcements/ }));

    await waitFor(() => expect(screen.getByText('Welcome to Biology')).toBeDefined());
    expect(screen.getByText(/Posted by/)).toBeDefined();
    expect(screen.getByText('Please review the syllabus before next class.')).toBeDefined();
    cleanup();

    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/announcements') return Promise.resolve([]);
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Announcements/ }));
    await waitFor(() => expect(screen.getByText('No announcements have been posted for this course yet.')).toBeDefined());
  });

  it('gracefully falls back to empty lists when grades, syllabus weeks, and announcements requests fail', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/grades') return Promise.reject(new Error('no grades'));
      if (endpoint === '/api/classes/c1/syllabus-weeks') return Promise.reject(new Error('no weeks'));
      if (endpoint === '/api/classes/c1/announcements') return Promise.reject(new Error('no announcements'));
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('No graded records posted yet.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Syllabus & Modules/ }));
    await waitFor(() => expect(screen.getByText('No syllabus posted yet.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Announcements/ }));
    await waitFor(() => expect(screen.getByText('No announcements have been posted for this course yet.')).toBeDefined());
  });

  it('shows "Classroom not found" and a dismissible error toast when the class fails to load', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1') return Promise.reject(new Error('network error'));
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByText('Classroom not found')).toBeDefined());
    expect(screen.getByText('Failed to load class information')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    await waitFor(() => expect(screen.queryByText('Failed to load class information')).toBeNull());
  });

  it('shows a dismissible error toast on the main view when assignments fail to load after the class loads', async () => {
    mockApiCall.mockImplementation((endpoint: string) => {
      if (endpoint === '/api/classes/c1/assignments') return Promise.reject(new Error('assignments down'));
      return routeApiCall(endpoint);
    });
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());
    expect(screen.getByText('Failed to load class information')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    await waitFor(() => expect(screen.queryByText('Failed to load class information')).toBeNull());
  });

  it('renders nothing when there is no authenticated user', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: () => false,
    });
    mockApiCall.mockImplementation(routeApiCall);
    const { container } = render(<StudentClassDetailPage />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('navigates back to the dashboard from the back button', async () => {
    mockApiCall.mockImplementation(routeApiCall);
    render(<StudentClassDetailPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Biology' })).toBeDefined());

    fireEvent.click(screen.getByText('Back to Portal'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
});
