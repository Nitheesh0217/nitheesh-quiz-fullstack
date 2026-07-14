import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';
import { buildSystemPrompt } from '../utils/promptBuilder';
import { executeTool } from '../utils/chatTools';
import { redis } from '../utils/redis';
import { env } from '../env';

function jsonOkResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('Chat and AI Assistant API (/api/chat)', () => {
  const app = buildApp();

  let schoolId: string;
  let teacherId: string;
  let studentId: string;
  let adminId: string;
  let classId: string;

  let studentToken: string;
  let teacherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await app.ready();

    // Force a deterministic baseline regardless of whatever real key is
    // configured in the local .env for manual testing.
    (env as any).AI_API_KEY = '';

    // Clean slate
    await db.deleteFrom('grades').execute();
    await db.deleteFrom('submissions').execute();
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    const school = await db
      .insertInto('schools')
      .values({ name: 'Chat Test Academy' })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    // Create Admin
    const admin = await db
      .insertInto('users')
      .values({
        email: 'admin.chat@school.edu',
        password_hash: pwHash,
        name: 'Chat Admin',
        role: 'admin',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    adminId = admin.id;
    adminToken = signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      school_id: admin.school_id, token_version: 0, onboarding_completed: true });

    // Create Teacher
    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher.chat@school.edu',
        password_hash: pwHash,
        name: 'Chat Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({
      sub: teacher.id,
      email: teacher.email,
      role: teacher.role,
      school_id: teacher.school_id, token_version: 0, onboarding_completed: true });

    // Create Student
    const student = await db
      .insertInto('users')
      .values({
        email: 'student.chat@school.edu',
        password_hash: pwHash,
        name: 'Chat Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentId = student.id;
    studentToken = signAccessToken({
      sub: student.id,
      email: student.email,
      role: student.role,
      school_id: student.school_id, token_version: 0, onboarding_completed: true });

    // Create a Class & Enrollment
    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'Chat Class 101',
        code: 'CC101',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    await db
      .insertInto('student_enrollments')
      .values({
        class_id: classroom.id,
        student_id: studentId,
        status: 'active',
      })
      .execute();

    // Create a pending assignment with a valid due date to cover the
    // due-date-formatting branch of get_my_assignments.
    await db
      .insertInto('assignments')
      .values({
        class_id: classroom.id,
        title: 'Pending Assignment With Date',
        description: 'Has a due date',
        due_date: new Date('2026-07-15T00:00:00.000Z'),
        rubric: JSON.stringify([]),
      })
      .execute();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (env as any).AI_API_KEY = '';
  });

  describe('System Prompt Builder', () => {
    it('should generate a system prompt for a student with role-appropriate navigation hints', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const prompt = await buildSystemPrompt(studentUser);
      expect(prompt).toContain('Chat Student');
      expect(prompt).toContain('Role: student');
      expect(prompt).toContain('/dashboard/student/grades');
      expect(prompt).toContain('call the appropriate tool');
    });

    it('should generate a system prompt for a teacher with role-appropriate navigation hints', async () => {
      const teacherUser = { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher' as const, school_id: schoolId };
      const prompt = await buildSystemPrompt(teacherUser);
      expect(prompt).toContain('Chat Teacher');
      expect(prompt).toContain('Role: teacher');
      expect(prompt).toContain('/dashboard/teacher/assignments/[id]/grade');
    });

    it('should generate a system prompt for an admin with role-appropriate navigation hints', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const prompt = await buildSystemPrompt(adminUser);
      expect(prompt).toContain('Chat Admin');
      expect(prompt).toContain('Role: admin');
      expect(prompt).toContain('/dashboard/classes');
    });

    it('should fall back to a generic name for a non-existent user', async () => {
      const prompt = await buildSystemPrompt({
        id: '00000000-0000-0000-0000-000000000000',
        email: 'ghost@school.edu',
        role: 'student',
        school_id: schoolId,
      });
      expect(prompt).toContain('Current user: User');
    });
  });

  describe('Chat Tools', () => {
    it('get_my_classes returns enrolled classes for a student', async () => {
      const result = await executeTool(
        'get_my_classes',
        '{}',
        { id: studentId, email: 'student.chat@school.edu', role: 'student', school_id: schoolId }
      );
      expect(Array.isArray(result.content)).toBe(true);
      expect(JSON.stringify(result.content)).toContain('Chat Class 101');
    });

    it('get_my_classes returns taught classes for a teacher', async () => {
      const result = await executeTool(
        'get_my_classes',
        '',
        { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher', school_id: schoolId }
      );
      expect(JSON.stringify(result.content)).toContain('Chat Class 101');
    });

    it('get_my_classes is rejected for an admin', async () => {
      const result = await executeTool(
        'get_my_classes',
        '{}',
        { id: adminId, email: 'admin.chat@school.edu', role: 'admin', school_id: schoolId }
      );
      expect((result.content as any).error).toContain('only available to students and teachers');
    });

    it('get_my_assignments defaults to pending and supports all', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const pending = await executeTool('get_my_assignments', '{}', studentUser);
      expect(JSON.stringify(pending.content)).toContain('Pending Assignment With Date');

      const all = await executeTool('get_my_assignments', '{"status":"all"}', studentUser);
      expect(JSON.stringify(all.content)).toContain('Pending Assignment With Date');
    });

    it('get_my_assignments returns authoritative counts and a pre-formatted due date', async () => {
      // Regression test: the model previously miscounted assignments/classes
      // in its own prose ("18 assignments across five classes" for real data
      // of 21/4) and misstated a due date by a day when made to reformat the
      // raw ISO timestamp itself. Both are now computed server-side so the
      // model only has to repeat them verbatim.
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const result = await executeTool('get_my_assignments', '{"status":"all"}', studentUser) as {
        content: { assignments: Array<{ title: string; due_date: string | null; class_name: string }>; total_count: number; class_count: number };
      };

      expect(Array.isArray(result.content.assignments)).toBe(true);
      expect(result.content.total_count).toBe(result.content.assignments.length);
      expect(result.content.class_count).toBe(new Set(result.content.assignments.map((a) => a.class_name)).size);

      const dated = result.content.assignments.find((a) => a.title === 'Pending Assignment With Date');
      expect(dated?.due_date).toBe('July 15, 2026');
    });

    it('get_my_assignments formats a null due date as null (not a string)', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };

      const assignment = await db
        .insertInto('assignments')
        .values({
          class_id: classId,
          title: 'No Due Date Tool Assignment',
          description: 'd',
          due_date: null,
          rubric: JSON.stringify([]),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const result = await executeTool('get_my_assignments', '{"status":"all"}', studentUser) as {
        content: { assignments: Array<{ title: string; due_date: string | null }> };
      };
      const found = result.content.assignments.find((a) => a.title === 'No Due Date Tool Assignment');
      expect(found?.due_date).toBeNull();

      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();
    });

    it('get_my_assignments is rejected for a teacher', async () => {
      const result = await executeTool(
        'get_my_assignments',
        '{}',
        { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher', school_id: schoolId }
      );
      expect((result.content as any).error).toContain('only available to students');
    });

    it('get_my_grades returns grades, per-course percentage/letter, and a matching cumulative GPA, and rejects other roles', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };

      const assignment = await db
        .insertInto('assignments')
        .values({
          class_id: classId,
          title: 'GPA Test Assignment',
          description: 'd',
          due_date: null,
          rubric: JSON.stringify([{ criterion: 'Quality', max_points: 100 }]),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const submission = await db
        .insertInto('submissions')
        .values({ assignment_id: assignment.id, student_id: studentId, status: 'graded', text_content: 'work' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('grades')
        .values({
          submission_id: submission.id,
          assignment_id: assignment.id,
          student_id: studentId,
          class_id: classId,
          total_score: 92,
          feedback: 'Great work',
          graded_by: teacherId,
          rubric_scores: JSON.stringify([{ criterion: 'Quality', score: 92 }]),
        })
        .execute();

      const result = await executeTool('get_my_grades', '{}', studentUser);
      const content = result.content as { grades: any[]; courses: any[]; cumulative_gpa: string | null };

      expect(Array.isArray(content.grades)).toBe(true);
      expect(content.grades.some((g) => g.assignment_title === 'GPA Test Assignment')).toBe(true);

      const course = content.courses.find((c) => c.class_name === 'Chat Class 101');
      expect(course).toBeDefined();
      expect(course.percentage).toBe(92);
      expect(course.letter).toBe('A');
      expect(content.cumulative_gpa).toBe('4.00');

      await db.deleteFrom('grades').where('assignment_id', '=', assignment.id).execute();
      await db.deleteFrom('submissions').where('assignment_id', '=', assignment.id).execute();
      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();

      const rejected = await executeTool(
        'get_my_grades',
        '{}',
        { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher', school_id: schoolId }
      );
      expect((rejected.content as any).error).toContain('only available to students');
    });

    it('get_my_grades maps every GPA letter tier and falls back to 100 max points for a non-array rubric', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };

      const tiers: Array<{ title: string; score: number; letter: string; rubric: unknown }> = [
        { title: 'Tier B', score: 85, letter: 'B', rubric: [{ criterion: 'Q', max_points: 100 }] },
        { title: 'Tier C', score: 75, letter: 'C', rubric: [{ criterion: 'Q', max_points: 100 }] },
        { title: 'Tier D', score: 65, letter: 'D', rubric: [{ criterion: 'Q', max_points: 100 }] },
        { title: 'Tier F', score: 50, letter: 'F', rubric: [{ criterion: 'Q', max_points: 100 }] },
        // A malformed (non-array) rubric falls back to a 100-point max.
        { title: 'Tier Non-Array Rubric', score: 60, letter: 'D', rubric: { not: 'an array' } },
      ];

      const classroom = await db
        .insertInto('classes')
        .values({ school_id: schoolId, teacher_id: teacherId, name: 'GPA Tier Class', code: 'GPT101' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('student_enrollments')
        .values({ class_id: classroom.id, student_id: studentId, status: 'active' })
        .execute();

      const createdAssignmentIds: string[] = [];
      for (const tier of tiers) {
        const assignment = await db
          .insertInto('assignments')
          .values({
            class_id: classroom.id,
            title: tier.title,
            description: 'd',
            due_date: null,
            rubric: JSON.stringify(tier.rubric),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        createdAssignmentIds.push(assignment.id);

        const submission = await db
          .insertInto('submissions')
          .values({ assignment_id: assignment.id, student_id: studentId, status: 'graded', text_content: 'work' })
          .returningAll()
          .executeTakeFirstOrThrow();

        await db
          .insertInto('grades')
          .values({
            submission_id: submission.id,
            assignment_id: assignment.id,
            student_id: studentId,
            class_id: classroom.id,
            total_score: tier.score,
            feedback: null,
            graded_by: teacherId,
            rubric_scores: JSON.stringify([]),
          })
          .execute();

        const result = await executeTool('get_my_grades', '{}', studentUser);
        const content = result.content as { courses: any[] };
        const course = content.courses.find((c) => c.class_name === 'GPA Tier Class');
        expect(course.letter).toBe(tier.letter);

        // Isolate each tier - delete before inserting the next one so the
        // course's running total reflects only the current assignment.
        await db.deleteFrom('grades').where('assignment_id', '=', assignment.id).execute();
        await db.deleteFrom('submissions').where('assignment_id', '=', assignment.id).execute();
      }

      await db.deleteFrom('assignments').where('id', 'in', createdAssignmentIds).execute();
      await db.deleteFrom('student_enrollments').where('class_id', '=', classroom.id).execute();
      await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
    });

    it('get_my_grades returns null cumulative_gpa when the student has no graded assignments', async () => {
      const emptyStudent = await db
        .insertInto('users')
        .values({
          email: 'no-grades.chat@school.edu',
          password_hash: 'hash',
          name: 'No Grades Student',
          role: 'student',
          school_id: schoolId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const result = await executeTool('get_my_grades', '{}', {
        id: emptyStudent.id,
        email: emptyStudent.email,
        role: 'student',
        school_id: schoolId,
      });
      const content = result.content as { grades: any[]; courses: any[]; cumulative_gpa: string | null };
      expect(content.grades).toEqual([]);
      expect(content.courses).toEqual([]);
      expect(content.cumulative_gpa).toBeNull();
    });

    it('get_class_roster works for the owning teacher and for admins, and rejects others', async () => {
      const teacherUser = { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher' as const, school_id: schoolId };
      const asTeacher = await executeTool('get_class_roster', JSON.stringify({ class_id: classId }), teacherUser);
      expect(JSON.stringify(asTeacher.content)).toContain('Chat Student');

      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const asAdmin = await executeTool('get_class_roster', JSON.stringify({ class_id: classId }), adminUser);
      expect(JSON.stringify(asAdmin.content)).toContain('Chat Student');

      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const asStudent = await executeTool('get_class_roster', JSON.stringify({ class_id: classId }), studentUser);
      expect((asStudent.content as any).error).toContain('only available to teachers and admins');
    });

    it('get_class_roster rejects a teacher who does not own the class', async () => {
      const otherTeacher = await db
        .insertInto('users')
        .values({
          email: 'other.teacher@school.edu',
          password_hash: 'hash',
          name: 'Other Teacher',
          role: 'teacher',
          school_id: schoolId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const result = await executeTool(
        'get_class_roster',
        JSON.stringify({ class_id: classId }),
        { id: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId }
      );
      expect((result.content as any).error).toContain('You are not the teacher of this class');
    });

    it('get_class_roster fails gracefully when class_id is omitted', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const result = await executeTool('get_class_roster', '{}', adminUser);
      expect((result.content as any).error).toBeDefined();
    });

    it('get_class_roster reports a class that does not exist', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const result = await executeTool(
        'get_class_roster',
        JSON.stringify({ class_id: '00000000-0000-0000-0000-000000000000' }),
        adminUser
      );
      expect((result.content as any).error).toContain('Class not found');
    });

    it('get_pending_grading_count works for a teacher and rejects other roles', async () => {
      const teacherUser = { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher' as const, school_id: schoolId };
      const result = await executeTool('get_pending_grading_count', '{}', teacherUser);
      expect(typeof (result.content as any).pending_count).toBe('number');

      const rejected = await executeTool(
        'get_pending_grading_count',
        '{}',
        { id: studentId, email: 'student.chat@school.edu', role: 'student', school_id: schoolId }
      );
      expect((rejected.content as any).error).toContain('only available to teachers');
    });

    it('get_platform_stats works for admin (with and without grades) and rejects other roles', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const noGrades = await executeTool('get_platform_stats', '{}', adminUser);
      expect((noGrades.content as any).average_grade).toBeNull();
      // No one is suspended yet - every role's count should fall back to 0.
      expect((noGrades.content as any).suspended_accounts_by_role).toEqual({ admin: 0, teacher: 0, student: 0 });

      await db.updateTable('users').set({ is_suspended: true }).where('id', '=', studentId).execute();
      const withSuspendedStudent = await executeTool('get_platform_stats', '{}', adminUser);
      expect((withSuspendedStudent.content as any).suspended_accounts_by_role).toEqual({ admin: 0, teacher: 0, student: 1 });
      await db.updateTable('users').set({ is_suspended: false }).where('id', '=', studentId).execute();

      await db.updateTable('users').set({ is_suspended: true }).where('id', '=', teacherId).execute();
      const withSuspendedTeacher = await executeTool('get_platform_stats', '{}', adminUser);
      expect((withSuspendedTeacher.content as any).suspended_accounts_by_role).toEqual({ admin: 0, teacher: 1, student: 0 });
      await db.updateTable('users').set({ is_suspended: false }).where('id', '=', teacherId).execute();

      await db.updateTable('users').set({ is_suspended: true }).where('id', '=', adminId).execute();
      const withSuspendedAdmin = await executeTool('get_platform_stats', '{}', adminUser);
      expect((withSuspendedAdmin.content as any).suspended_accounts_by_role).toEqual({ admin: 1, teacher: 0, student: 0 });
      await db.updateTable('users').set({ is_suspended: false }).where('id', '=', adminId).execute();

      const assignment = await db
        .insertInto('assignments')
        .values({
          class_id: classId,
          title: 'Stats Assignment',
          description: 'desc',
          due_date: null,
          rubric: JSON.stringify([]),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const submission = await db
        .insertInto('submissions')
        .values({ assignment_id: assignment.id, student_id: studentId, status: 'graded', text_content: 'work' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('grades')
        .values({
          submission_id: submission.id,
          assignment_id: assignment.id,
          student_id: studentId,
          class_id: classId,
          total_score: 88,
          feedback: 'Nice work',
          graded_by: teacherId,
          rubric_scores: JSON.stringify([]),
        })
        .execute();

      const withGrades = await executeTool('get_platform_stats', '{}', adminUser);
      expect((withGrades.content as any).average_grade).toBe(88);

      const rejected = await executeTool(
        'get_platform_stats',
        '{}',
        { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher', school_id: schoolId }
      );
      expect((rejected.content as any).error).toContain('only available to admins');

      await db.deleteFrom('grades').execute();
      await db.deleteFrom('submissions').execute();
      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();
    });

    it('get_schools returns registered schools for admin and rejects other roles', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      const result = await executeTool('get_schools', '{}', adminUser);
      const schools = result.content as Array<{ id: string; name: string }>;
      expect(Array.isArray(schools)).toBe(true);
      expect(schools.some((s) => s.name === 'Chat Test Academy')).toBe(true);

      const rejected = await executeTool(
        'get_schools',
        '{}',
        { id: teacherId, email: 'teacher.chat@school.edu', role: 'teacher', school_id: schoolId }
      );
      expect((rejected.content as any).error).toContain('only available to admins');
    });

    it('navigate_to_page echoes back a navigate action, defaulting missing fields', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const withArgs = await executeTool(
        'navigate_to_page',
        JSON.stringify({ path: '/dashboard/student/grades', label: 'View grades' }),
        studentUser
      );
      expect(withArgs.navigateAction).toEqual({ type: 'navigate', path: '/dashboard/student/grades', label: 'View grades' });

      const withoutArgs = await executeTool('navigate_to_page', '{}', studentUser);
      expect(withoutArgs.navigateAction).toEqual({ type: 'navigate', path: '', label: '' });
    });

    it('returns an error for malformed tool argument JSON', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const result = await executeTool('get_my_classes', '{not valid json', studentUser);
      expect((result.content as any).error).toContain('Invalid tool arguments JSON');
    });

    it('returns an error for an unknown tool name', async () => {
      const studentUser = { id: studentId, email: 'student.chat@school.edu', role: 'student' as const, school_id: schoolId };
      const result = await executeTool('not_a_real_tool', '{}', studentUser);
      expect((result.content as any).error).toContain('Unknown tool');
    });

    it('wraps unexpected (non-ToolExecutionError) failures in a generic message', async () => {
      const adminUser = { id: adminId, email: 'admin.chat@school.edu', role: 'admin' as const, school_id: schoolId };
      // An invalid UUID triggers a raw Postgres driver error, not a ToolExecutionError.
      const result = await executeTool('get_class_roster', JSON.stringify({ class_id: 'not-a-uuid' }), adminUser);
      expect((result.content as any).error).toBe('Tool execution failed.');
    });
  });

  describe('Redis rate limiting', () => {
    it('should trigger redis error handler and log error in development', () => {
      const originalEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'development';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      redis.emit('error', new Error('mock error'));
      expect(consoleSpy).toHaveBeenCalled();
      (env as any).NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should handle redis increment failure gracefully', async () => {
      vi.spyOn(redis, 'incr').mockRejectedValueOnce(new Error('Incr Failed'));
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello redis error' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should return 429 rate limit exceeded if request count > 20 in Redis', async () => {
      vi.spyOn(redis, 'incr').mockResolvedValue(21);

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error).toContain('Rate limit exceeded');
    });
  });

  describe('POST /api/chat endpoint', () => {
    it('should return 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Hello' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('should reject bad inputs with 400 validation error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('should stream mock response when AI_API_KEY is not set', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'How do I submit an assignment?' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.body).toContain('Hi');
    });

    it('should stream mock response for teacher and cover all branches', async () => {
      await db.insertInto('classes').values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'Empty Normal Class',
        code: 'ENC101',
      }).execute();

      await db.insertInto('classes').values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'QA Test Class',
        code: 'QAC101',
      }).execute();

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'How many students?' }
      });
      expect(response1.statusCode).toBe(200);

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'Evaluate assignments' }
      });
      expect(response2.statusCode).toBe(200);

      const response3 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'Hello' }
      });
      expect(response3.statusCode).toBe(200);
    });

    it('should stream mock response for student grades and other queries', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'my grades' }
      });
      expect(response1.statusCode).toBe(200);

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' }
      });
      expect(response2.statusCode).toBe(200);
    });

    it('should stream mock response for admin role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}` },
        payload: { message: 'Hello' }
      });
      expect(response.statusCode).toBe(200);
    });

    it('should report a real average grade in the admin mock stats branch', async () => {
      const assignment = await db
        .insertInto('assignments')
        .values({ class_id: classId, title: 'Mock Stats Assignment', description: 'd', due_date: null, rubric: JSON.stringify([]) })
        .returningAll()
        .executeTakeFirstOrThrow();
      const submission = await db
        .insertInto('submissions')
        .values({ assignment_id: assignment.id, student_id: studentId, status: 'graded', text_content: 'work' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('grades')
        .values({
          submission_id: submission.id,
          assignment_id: assignment.id,
          student_id: studentId,
          class_id: classId,
          total_score: 77,
          feedback: 'ok',
          graded_by: teacherId,
          rubric_scores: JSON.stringify([]),
        })
        .execute();

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}` },
        payload: { message: 'show stats' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('77%');

      await db.deleteFrom('grades').execute();
      await db.deleteFrom('submissions').execute();
      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();
    });

    it('should treat AI_API_KEY variants as dummy keys outside test env', async () => {
      const originalEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'development';

      (env as any).AI_API_KEY = 'your-api-key';
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' },
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.headers['content-type']).toContain('text/event-stream');

      (env as any).AI_API_KEY = 'mock-something';
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.headers['content-type']).toContain('text/event-stream');

      (env as any).AI_API_KEY = '   ';
      const res3 = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' },
      });
      expect(res3.statusCode).toBe(200);
      expect(res3.headers['content-type']).toContain('text/event-stream');

      (env as any).NODE_ENV = originalEnv;
    });

    it('should execute delay in mock stream when NODE_ENV is not test', async () => {
      const originalEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'development';

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' }
      });

      expect(response.statusCode).toBe(200);

      (env as any).NODE_ENV = originalEnv;
    });

    it('should cover all mock assistant branches for students, teachers, and admins', async () => {
      const resStudentCode = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'javascript function code' },
      });
      expect(resStudentCode.statusCode).toBe(200);
      expect(resStudentCode.body).toContain('calculateAverage');

      const resStudentOOS = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'weather tomorrow' },
      });
      expect(resStudentOOS.statusCode).toBe(200);
      expect(resStudentOOS.body).toContain('academic');

      const resTeacherCode = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'javascript function code' },
      });
      expect(resTeacherCode.statusCode).toBe(200);
      expect(resTeacherCode.body).toContain('getLetterGrade');

      const resTeacherOOS = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'weather tomorrow' },
      });
      expect(resTeacherOOS.statusCode).toBe(200);
      expect(resTeacherOOS.body).toContain('assisting');

      const resAdminStats = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}` },
        payload: { message: 'show stats' },
      });
      expect(resAdminStats.statusCode).toBe(200);
      expect(resAdminStats.body).toContain('Statistics');

      const resAdminOOS = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}` },
        payload: { message: 'weather tomorrow' },
      });
      expect(resAdminOOS.statusCode).toBe(200);
      expect(resAdminOOS.body).toContain('administration');

      const resAdminNullStats = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}` },
        payload: { message: 'show stats' },
      });
      expect(resAdminNullStats.statusCode).toBe(200);
    });

    it('should cover empty-state branches in the mock stream for teachers and students', async () => {
      const pwHash = await hashPassword('password123');

      const emptyTeacher = await db
        .insertInto('users')
        .values({ email: 'empty.teacher.mock@school.edu', password_hash: pwHash, name: 'Empty Teacher Mock', role: 'teacher', school_id: schoolId })
        .returningAll()
        .executeTakeFirstOrThrow();
      const emptyTeacherToken = signAccessToken({
        sub: emptyTeacher.id,
        email: emptyTeacher.email,
        role: 'teacher',
        school_id: emptyTeacher.school_id, token_version: 0, onboarding_completed: true });

      const resEmptyTeacherClasses = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${emptyTeacherToken}` },
        payload: { message: 'how many classes' },
      });
      expect(resEmptyTeacherClasses.statusCode).toBe(200);
      expect(resEmptyTeacherClasses.body).toContain('No');
      expect(resEmptyTeacherClasses.body).toContain('active');

      const emptyStudent = await db
        .insertInto('users')
        .values({ email: 'empty.student.mock@school.edu', password_hash: pwHash, name: 'Empty Student Mock', role: 'student', school_id: schoolId })
        .returningAll()
        .executeTakeFirstOrThrow();
      const emptyStudentToken = signAccessToken({
        sub: emptyStudent.id,
        email: emptyStudent.email,
        role: emptyStudent.role,
        school_id: emptyStudent.school_id, token_version: 0, onboarding_completed: true });

      const resEmptyAssignments = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${emptyStudentToken}` },
        payload: { message: 'pending assignments' },
      });
      expect(resEmptyAssignments.statusCode).toBe(200);
      expect(resEmptyAssignments.body).toContain('No');
      expect(resEmptyAssignments.body).toContain('pending');

      const resEmptyGrades = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${emptyStudentToken}` },
        payload: { message: 'what are my grades' },
      });
      expect(resEmptyGrades.statusCode).toBe(200);
      expect(resEmptyGrades.body).toContain('received');
    });

    it('should default to "None" for a grade with no feedback in the mock stream', async () => {
      const assignment = await db
        .insertInto('assignments')
        .values({ class_id: classId, title: 'No Feedback Assignment', description: 'd', due_date: null, rubric: JSON.stringify([]) })
        .returningAll()
        .executeTakeFirstOrThrow();
      const submission = await db
        .insertInto('submissions')
        .values({ assignment_id: assignment.id, student_id: studentId, status: 'graded', text_content: 'work' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('grades')
        .values({
          submission_id: submission.id,
          assignment_id: assignment.id,
          student_id: studentId,
          class_id: classId,
          total_score: 60,
          feedback: null,
          graded_by: teacherId,
          rubric_scores: JSON.stringify([]),
        })
        .execute();

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'my grades' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('None');

      await db.deleteFrom('grades').execute();
      await db.deleteFrom('submissions').execute();
      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();
    });

    it('should show "N/A" for a pending assignment with no due date in the mock stream', async () => {
      const assignment = await db
        .insertInto('assignments')
        .values({ class_id: classId, title: 'No Due Date Assignment', description: 'd', due_date: null, rubric: JSON.stringify([]) })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'what assignments are due' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('N/A');

      await db.deleteFrom('assignments').where('id', '=', assignment.id).execute();
    });
  });

  describe('POST /api/chat with a real AI provider key', () => {
    it('should complete a tool-call round trip and stream the final answer', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementationOnce(async () =>
        jsonOkResponse({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: 'call_1', function: { name: 'get_pending_grading_count', arguments: '{}' } }],
            },
          }],
        })
      ).mockImplementationOnce(async () =>
        jsonOkResponse({
          choices: [{ message: { content: 'You have some submissions pending.', tool_calls: [] } }],
        })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'How many submissions are pending?' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.body).toContain('pending');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const firstCallBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(firstCallBody.tools).toBeDefined();
      expect(firstCallBody.messages[0].role).toBe('system');
    });

    it('should emit a navigate action chunk when the model calls navigate_to_page', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementationOnce(async () =>
        jsonOkResponse({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_1',
                function: {
                  name: 'navigate_to_page',
                  arguments: JSON.stringify({ path: '/dashboard/student/grades', label: 'View grades' }),
                },
              }],
            },
          }],
        })
      ).mockImplementationOnce(async () =>
        jsonOkResponse({
          choices: [{ message: { content: 'Here you go!', tool_calls: [] } }],
        })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Take me to my grades' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"action"');
      expect(response.body).toContain('/dashboard/student/grades');
      fetchSpy.mockRestore();
    });

    it('should retry when the model leaks a malformed pseudo tool-call as plain text', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';

      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockImplementationOnce(async () =>
          jsonOkResponse({
            choices: [{ message: { content: 'call:get_my_classes{}<tool_call|>', tool_calls: [] } }],
          })
        )
        .mockImplementationOnce(async () =>
          jsonOkResponse({
            choices: [{ message: { content: 'You have 3 classes.', tool_calls: [] } }],
          })
        );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
        payload: { message: 'How many classes do I have?' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('classes');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondCallBody = JSON.parse((fetchSpy.mock.calls[1][1] as any).body);
      expect(secondCallBody.messages.at(-1).content).toContain('not a valid tool call');
    });

    it('should cap the tool-call loop and force a final text-only answer', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';

      const toolCallResponse = async () =>
        jsonOkResponse({
          choices: [{
            message: {
              content: null,
              tool_calls: [{ id: 'call_x', function: { name: 'get_my_grades', arguments: '{}' } }],
            },
          }],
        });

      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(async () =>
          jsonOkResponse({ choices: [{ message: { content: 'Final forced answer.', tool_calls: [] } }] })
        );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'What are my grades?' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Final');
      expect(response.body).toContain('answer');
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      const finalCallBody = JSON.parse((fetchSpy.mock.calls[3][1] as any).body);
      expect(finalCallBody.tools).toBeUndefined();
    });

    it('should handle a final answer with no content and an omitted tool_calls field', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementationOnce(async () =>
        jsonOkResponse({ choices: [{ message: { content: null } }] })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      fetchSpy.mockRestore();
    });

    it('should handle a round-cap-forced final answer with no content', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const toolCallResponse = async () =>
        jsonOkResponse({
          choices: [{
            message: { content: null, tool_calls: [{ id: 'call_x', function: { name: 'get_my_grades', arguments: '{}' } }] },
          }],
        });

      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(toolCallResponse)
        .mockImplementationOnce(async () => jsonOkResponse({ choices: [{ message: { content: null, tool_calls: [] } }] }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'What are my grades?' },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      fetchSpy.mockRestore();
    });

    it('should retry with the fallback model when the main model fails, and succeed', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const fetchSpy = vi.spyOn(global, 'fetch')
        .mockImplementationOnce(async () => ({ ok: false, status: 503 }) as any)
        .mockImplementationOnce(async () =>
          jsonOkResponse({ choices: [{ message: { content: 'Fallback model answer.', tool_calls: [] } }] })
        );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello fallback' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Fallback');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const firstCallBody = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      const secondCallBody = JSON.parse((fetchSpy.mock.calls[1][1] as any).body);
      expect(firstCallBody.model).toBe(env.AI_MODEL);
      expect(secondCallBody.model).toBe('mistralai/mistral-medium-3.5-128b');
      // Mistral's tokenizer 400s on chat_template_kwargs - the main call may
      // send it, but the fallback call must never include it.
      expect(firstCallBody.chat_template_kwargs).toBeDefined();
      expect(secondCallBody.chat_template_kwargs).toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to mistralai/mistral-medium-3.5-128b'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('model=mistralai/mistral-medium-3.5-128b'));

      consoleWarnSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should fall back to mock stream when the AI API returns a non-ok status', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello error' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      fetchSpy.mockRestore();
    });

    it('should fall back to mock stream when the AI API returns no message', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(jsonOkResponse({ choices: [] }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello no message' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      fetchSpy.mockRestore();
    });

    it('should fall back to mock stream when the fetch call throws', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'What assignments do I have due?' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.body).toContain('assignments');
      fetchSpy.mockRestore();
    });

    it('should fall back to mock stream when the AI request times out', async () => {
      (env as any).AI_API_KEY = 'nvapi-test-key';

      // Fire the main (20s) and fallback (35s) AI-request timeouts
      // immediately, but pass every other setTimeout call straight through
      // so unrelated pg/redis/fastify internals keep working normally.
      const realSetTimeout = global.setTimeout;
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, delay?: number, ...args: unknown[]) => {
        if (delay === 20000 || delay === 35000) {
          fn();
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn, delay, ...args);
      }) as typeof setTimeout);

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((_url: any, opts: any) => {
        return new Promise((_resolve, reject) => {
          const rejectAborted = () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          };
          // The mocked setTimeout above fires synchronously, so the signal
          // may already be aborted by the time fetch is called.
          if (opts.signal?.aborted) {
            rejectAborted();
            return;
          }
          opts.signal.addEventListener('abort', rejectAborted);
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
        payload: { message: 'Hello timeout' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      setTimeoutSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });
});
