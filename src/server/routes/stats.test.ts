import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('School Statistics API (/api/v0/stats)', () => {
  const app = buildApp();

  let schoolId: string;
  let teacherId: string;
  let studentId: string;
  let studentToken: string;
  let teacherToken: string;
  let classId: string;
  let assignmentId: string;

  beforeAll(async () => {
    await app.ready();

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
      .values({ name: 'Stats Test Academy' })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    const teacher = await db
      .insertInto('users')
      .values({
        email: 'stats-teacher@school.edu',
        password_hash: pwHash,
        name: 'Stats Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const student = await db
      .insertInto('users')
      .values({
        email: 'stats-student@school.edu',
        password_hash: pwHash,
        name: 'Stats Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentId = student.id;
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'Stats 101',
        code: 'STAT101',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    await db
      .insertInto('student_enrollments')
      .values({ class_id: classId, student_id: studentId, status: 'active' })
      .execute();

    const assignment = await db
      .insertInto('assignments')
      .values({
        class_id: classId,
        title: 'Stats Assignment',
        rubric: JSON.stringify([{ criterion: 'Accuracy', max_points: 100 }]),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    assignmentId = assignment.id;

    const submission = await db
      .insertInto('submissions')
      .values({
        assignment_id: assignmentId,
        student_id: studentId,
        text_content: 'my answer',
        status: 'graded',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('grades')
      .values({
        submission_id: submission.id,
        assignment_id: assignmentId,
        student_id: studentId,
        class_id: classId,
        graded_by: teacherId,
        rubric_scores: JSON.stringify([{ criterion: 'Accuracy', score: 90 }]),
        total_score: '90',
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom('grades').execute();
    await db.deleteFrom('submissions').execute();
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  describe('GET /api/v0/stats/average-grades', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v0/stats/average-grades' });
      expect(response.statusCode).toBe(401);
    });

    it('returns a numeric average for an authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/average-grades',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('average');
      expect(body.average).toBe(90);
    });

    it('returns null average when no grades exist', async () => {
      // Temporarily delete grades
      await db.deleteFrom('grades').execute();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/average-grades',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().average).toBeNull();

      // Restore grade
      const sub = await db.selectFrom('submissions').select('id').executeTakeFirst();
      await db
        .insertInto('grades')
        .values({
          submission_id: sub!.id,
          assignment_id: assignmentId,
          student_id: studentId,
          class_id: classId,
          graded_by: teacherId,
          rubric_scores: JSON.stringify([{ criterion: 'Accuracy', score: 90 }]),
          total_score: '90',
        })
        .execute();
    });
  });

  describe('GET /api/v0/stats/average-grades/:class_id', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: `/api/v0/stats/average-grades/${classId}` });
      expect(response.statusCode).toBe(401);
    });

    it('returns the average for a specific class', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v0/stats/average-grades/${classId}`,
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.class_id).toBe(classId);
      expect(body.class_name).toBe('Stats 101');
      expect(body.average).toBe(90);
    });

    it('returns 404 for a class that does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/average-grades/00000000-0000-0000-0000-000000000000',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns null average for class with no grades', async () => {
      // Temporarily delete grades
      await db.deleteFrom('grades').execute();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v0/stats/average-grades/${classId}`,
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().average).toBeNull();

      // Restore grade
      const sub = await db.selectFrom('submissions').select('id').executeTakeFirst();
      await db
        .insertInto('grades')
        .values({
          submission_id: sub!.id,
          assignment_id: assignmentId,
          student_id: studentId,
          class_id: classId,
          graded_by: teacherId,
          rubric_scores: JSON.stringify([{ criterion: 'Accuracy', score: 90 }]),
          total_score: '90',
        })
        .execute();
    });
  });

  describe('GET /api/v0/stats/teacher-names', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v0/stats/teacher-names' });
      expect(response.statusCode).toBe(401);
    });

    it('returns only users with the teacher role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/teacher-names',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((t: { id: string }) => t.id === teacherId)).toBe(true);
      expect(body.some((t: { id: string }) => t.id === studentId)).toBe(false);
    });
  });

  describe('GET /api/v0/stats/student-names', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v0/stats/student-names' });
      expect(response.statusCode).toBe(401);
    });

    it('returns only users with the student role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/student-names',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((s: { id: string }) => s.id === studentId)).toBe(true);
      expect(body.some((s: { id: string }) => s.id === teacherId)).toBe(false);
    });
  });

  describe('GET /api/v0/stats/classes', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v0/stats/classes' });
      expect(response.statusCode).toBe(401);
    });

    it('returns all classes with their teacher name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/classes',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      const found = body.find((c: { id: string }) => c.id === classId);
      expect(found).toBeDefined();
      expect(found.teacher_name).toBe('Stats Teacher');
    });
  });

  describe('GET /api/v0/stats/classes/:class_id', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await app.inject({ method: 'GET', url: `/api/v0/stats/classes/${classId}` });
      expect(response.statusCode).toBe(401);
    });

    it('returns the list of enrolled students for a class', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v0/stats/classes/${classId}`,
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.class_id).toBe(classId);
      expect(body.class_name).toBe('Stats 101');
      expect(Array.isArray(body.students)).toBe(true);
      expect(body.students.length).toBe(1);
      expect(body.students[0].id).toBe(studentId);
    });

    it('returns 404 for a class that does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v0/stats/classes/00000000-0000-0000-0000-000000000000',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
