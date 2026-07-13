import { db } from '../db';
import type { AuthUser } from '../types';

// Tool schemas, OpenAI-compatible `tools` array. Every executor below is
// hard-scoped to the authenticated user (request.user) - the model can never
// supply a student_id/class_id that reads someone else's data, except
// get_class_roster/navigate_to_page which take a class_id/path the model
// must have already learned from a prior tool result or the system prompt.
export const chatToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_my_classes',
      description:
        "Get the authenticated user's classes: for a student, their enrolled classes; for a teacher, the classes they teach. Returns each class's id, name, and code.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_assignments',
      description:
        "Get the authenticated student's assignments. Use status 'pending' for unsubmitted assignments only, or 'all' for every assignment across their enrolled classes. The result's total_count and class_count are the authoritative totals - state those exact numbers verbatim rather than counting the assignments array yourself. Each assignment's due_date is already a formatted string (e.g. \"August 4, 2026\") - repeat it exactly as given, never recompute or shift it.",
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'all'] },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_grades',
      description:
        "Get the authenticated student's grades and feedback across all their graded assignments, plus a " +
        'per-course percentage/letter grade and a cumulative GPA (4.0 scale), computed the same way the ' +
        "grades page does. Use this for any GPA or overall-grade question - never estimate a GPA yourself.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_class_roster',
      description:
        'Get the roster (enrolled students) of a specific class. The teacher must own the class; an admin may query any class.',
      parameters: {
        type: 'object',
        properties: {
          class_id: { type: 'string', description: 'The id of the class, from get_my_classes.' },
        },
        required: ['class_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_grading_count',
      description: "Get the count of the authenticated teacher's submissions that are awaiting grading.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_platform_stats',
      description:
        'Get platform-wide statistics: total registered users, active classes, suspended accounts (both a ' +
        'total and a breakdown by role via suspended_accounts_by_role.admin/teacher/student), and the ' +
        "average grade across the platform. Admin only. Use the by-role breakdown for any role-specific " +
        'question like "are any teachers suspended" - never guess which role a suspended count belongs to.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schools',
      description:
        'Get the list of registered schools (id and name) on the platform. Admin only. Call this before ' +
        'navigating to a specific school\'s page (e.g. "the first school", "Concentrate Academy") since ' +
        'navigate_to_page needs a real school id, which only this tool can provide.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to_page',
      description:
        "Signal that the chat UI should show a button letting the user navigate somewhere in the app. Call this after answering, with a real path (substituting any [id] placeholders with an actual id you already know from a prior tool call) and a short button label.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The app path to navigate to, e.g. /dashboard/student/grades' },
          label: { type: 'string', description: 'Short button label, e.g. "View grades"' },
        },
        required: ['path', 'label'],
      },
    },
  },
] as const;

export type ChatToolName = (typeof chatToolDefinitions)[number]['function']['name'];

class ToolExecutionError extends Error {}

async function getMyClasses(user: AuthUser) {
  if (user.role === 'teacher') {
    return db
      .selectFrom('classes')
      .select(['id', 'name', 'code'])
      .where('teacher_id', '=', user.id)
      .execute();
  }

  if (user.role === 'student') {
    return db
      .selectFrom('classes')
      .innerJoin('student_enrollments', 'student_enrollments.class_id', 'classes.id')
      .select(['classes.id', 'classes.name', 'classes.code'])
      .where('student_enrollments.student_id', '=', user.id)
      .where('student_enrollments.status', '=', 'active')
      .execute();
  }

  throw new ToolExecutionError('get_my_classes is only available to students and teachers.');
}

// Formats a due date into one unambiguous, fixed string in UTC (matching how
// due_date is stored) so the model only ever has to copy this value verbatim
// into its reply instead of parsing/reformatting the raw ISO timestamp itself
// - the latter is what let it state a date a day off from reality.
function formatDueDate(date: Date | string | null): string | null {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

async function getMyAssignments(user: AuthUser, status: 'pending' | 'all') {
  if (user.role !== 'student') {
    throw new ToolExecutionError('get_my_assignments is only available to students.');
  }

  let query = db
    .selectFrom('assignments')
    .innerJoin('student_enrollments', 'student_enrollments.class_id', 'assignments.class_id')
    .innerJoin('classes', 'classes.id', 'assignments.class_id')
    .leftJoin('submissions', (join) =>
      join.onRef('submissions.assignment_id', '=', 'assignments.id').on('submissions.student_id', '=', user.id)
    )
    .select([
      'assignments.id',
      'assignments.title',
      'assignments.due_date',
      'classes.name as class_name',
      'submissions.status as submission_status',
    ])
    .where('student_enrollments.student_id', '=', user.id)
    .where('student_enrollments.status', '=', 'active');

  if (status === 'pending') {
    query = query.where('submissions.id', 'is', null);
  }

  const rows = await query.execute();
  const assignments = rows.map((row) => ({ ...row, due_date: formatDueDate(row.due_date) }));

  // total_count/class_count are provided so the model states an exact,
  // authoritative number instead of counting the array itself in prose,
  // which is where it previously miscounted (e.g. "18 assignments across
  // five classes" for what was really 21 assignments across 4 classes).
  return {
    assignments,
    total_count: assignments.length,
    class_count: new Set(assignments.map((a) => a.class_name)).size,
  };
}

// Mirrors getGpaMetrics() in src/app/dashboard/student/grades/page.tsx exactly,
// so the chatbot's GPA never disagrees with what the grades page shows.
function getGpaMetrics(pct: number): { letter: string; points: number } {
  if (pct >= 90) return { letter: 'A', points: 4.0 };
  if (pct >= 80) return { letter: 'B', points: 3.0 };
  if (pct >= 70) return { letter: 'C', points: 2.0 };
  if (pct >= 60) return { letter: 'D', points: 1.0 };
  return { letter: 'F', points: 0.0 };
}

async function getMyGrades(user: AuthUser) {
  if (user.role !== 'student') {
    throw new ToolExecutionError('get_my_grades is only available to students.');
  }

  const rows = await db
    .selectFrom('assignments')
    .innerJoin('classes', 'classes.id', 'assignments.class_id')
    .innerJoin('student_enrollments', 'student_enrollments.class_id', 'assignments.class_id')
    .leftJoin('grades', (join) =>
      join.onRef('grades.assignment_id', '=', 'assignments.id').on('grades.student_id', '=', user.id)
    )
    .select([
      'classes.id as class_id',
      'classes.name as class_name',
      'assignments.title as assignment_title',
      'assignments.rubric',
      'grades.id as grade_id',
      'grades.total_score',
      'grades.feedback',
    ])
    .where('student_enrollments.student_id', '=', user.id)
    .where('student_enrollments.status', '=', 'active')
    .execute();

  const grades = rows
    .filter((row) => row.total_score !== null)
    .map((row) => ({
      grade_id: row.grade_id,
      assignment_title: row.assignment_title,
      class_name: row.class_name,
      total_score: row.total_score,
      feedback: row.feedback,
    }));

  // Per-course totals, counting only graded assignments toward each
  // course's earned/max points - same rule the grades page uses.
  const perClass = new Map<string, { class_name: string; earned: number; max: number }>();
  for (const row of rows) {
    if (row.total_score === null) continue;

    // rubric is a jsonb column - the driver always hands back a parsed value.
    const rubric = row.rubric;
    const maxPoints = Array.isArray(rubric)
      ? rubric.reduce((sum: number, criterion: { max_points: number }) => sum + criterion.max_points, 0)
      : 100;

    const entry = perClass.get(row.class_id) ?? { class_name: row.class_name, earned: 0, max: 0 };
    entry.earned += Number(row.total_score);
    entry.max += maxPoints;
    perClass.set(row.class_id, entry);
  }

  const courses = [...perClass.values()]
    .filter((course) => course.max > 0)
    .map((course) => {
      const percentage = Math.round((course.earned / course.max) * 100);
      const { letter, points } = getGpaMetrics(percentage);
      return { class_name: course.class_name, percentage, letter, points };
    });

  const cumulative_gpa =
    courses.length > 0
      ? (courses.reduce((sum, course) => sum + course.points, 0) / courses.length).toFixed(2)
      : null;

  return { grades, courses, cumulative_gpa };
}

async function getClassRoster(user: AuthUser, classId: string) {
  if (user.role !== 'teacher' && user.role !== 'admin') {
    throw new ToolExecutionError('get_class_roster is only available to teachers and admins.');
  }

  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new ToolExecutionError('Class not found.');
  }

  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ToolExecutionError('You are not the teacher of this class.');
  }

  return db
    .selectFrom('student_enrollments')
    .innerJoin('users', 'users.id', 'student_enrollments.student_id')
    .select(['users.id', 'users.name', 'users.email', 'student_enrollments.status'])
    .where('student_enrollments.class_id', '=', classId)
    .execute();
}

async function getPendingGradingCount(user: AuthUser) {
  if (user.role !== 'teacher') {
    throw new ToolExecutionError('get_pending_grading_count is only available to teachers.');
  }

  const result = await db
    .selectFrom('submissions')
    .innerJoin('assignments', 'assignments.id', 'submissions.assignment_id')
    .innerJoin('classes', 'classes.id', 'assignments.class_id')
    .select((eb) => eb.fn.count('submissions.id').as('count'))
    .where('classes.teacher_id', '=', user.id)
    .where('submissions.status', '=', 'submitted')
    .executeTakeFirstOrThrow();

  return { pending_count: Number(result.count) };
}

async function getPlatformStats(user: AuthUser) {
  if (user.role !== 'admin') {
    throw new ToolExecutionError('get_platform_stats is only available to admins.');
  }

  const totalUsersRes = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count('id').as('count'))
    .executeTakeFirstOrThrow();
  const totalClassesRes = await db
    .selectFrom('classes')
    .select((eb) => eb.fn.count('id').as('count'))
    .executeTakeFirstOrThrow();
  const totalSuspendedRes = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count('id').as('count'))
    .where('is_suspended', '=', true)
    .executeTakeFirstOrThrow();
  const suspendedByRole = await db
    .selectFrom('users')
    .select(['role', (eb) => eb.fn.count('id').as('count')])
    .where('is_suspended', '=', true)
    .groupBy('role')
    .execute();
  const averageGradeRes = await db
    .selectFrom('grades')
    .select((eb) => eb.fn.avg('total_score').as('average'))
    .executeTakeFirst();

  return {
    total_users: Number(totalUsersRes.count),
    active_classes: Number(totalClassesRes.count),
    suspended_accounts: Number(totalSuspendedRes.count),
    suspended_accounts_by_role: {
      admin: Number(suspendedByRole.find((r) => r.role === 'admin')?.count ?? 0),
      teacher: Number(suspendedByRole.find((r) => r.role === 'teacher')?.count ?? 0),
      student: Number(suspendedByRole.find((r) => r.role === 'student')?.count ?? 0),
    },
    average_grade:
      averageGradeRes?.average !== null && averageGradeRes?.average !== undefined
        ? Math.round(Number(averageGradeRes.average) * 10) / 10
        : null,
  };
}

async function getSchools(user: AuthUser) {
  if (user.role !== 'admin') {
    throw new ToolExecutionError('get_schools is only available to admins.');
  }

  return db
    .selectFrom('schools')
    .select(['id', 'name'])
    .orderBy('created_at', 'asc')
    .execute();
}

export interface NavigateAction {
  type: 'navigate';
  path: string;
  label: string;
}

export interface ToolCallResult {
  content: unknown;
  navigateAction?: NavigateAction;
}

// Executes a single tool call against the DB, hard-scoped to `user`.
// Never throws - the LLM should always get a JSON result back (even if it's
// an error message) so it can react appropriately instead of the whole
// request blowing up on one bad tool call.
export async function executeTool(name: string, rawArgs: string, user: AuthUser): Promise<ToolCallResult> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { content: { error: 'Invalid tool arguments JSON.' } };
  }

  try {
    switch (name) {
      case 'get_my_classes':
        return { content: await getMyClasses(user) };
      case 'get_my_assignments':
        return { content: await getMyAssignments(user, args.status === 'all' ? 'all' : 'pending') };
      case 'get_my_grades':
        return { content: await getMyGrades(user) };
      case 'get_class_roster':
        return { content: await getClassRoster(user, String(args.class_id ?? '')) };
      case 'get_pending_grading_count':
        return { content: await getPendingGradingCount(user) };
      case 'get_platform_stats':
        return { content: await getPlatformStats(user) };
      case 'get_schools':
        return { content: await getSchools(user) };
      case 'navigate_to_page': {
        const path = String(args.path ?? '');
        const label = String(args.label ?? '');
        return {
          content: { ok: true },
          navigateAction: { type: 'navigate', path, label },
        };
      }
      default:
        return { content: { error: `Unknown tool: ${name}` } };
    }
  } catch (err) {
    const message = err instanceof ToolExecutionError ? err.message : 'Tool execution failed.';
    return { content: { error: message } };
  }
}
