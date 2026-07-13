import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Syllabus Weeks Routes Integration', () => {
  const app = buildApp();

  let schoolId: string;
  let teacherId: string;
  let teacherToken: string;
  let unauthorizedTeacherToken: string;
  let studentToken: string;

  let classId: string;
  let otherClassId: string;
  let assignmentId: string;
  let otherClassAssignmentId: string;
  let weekId: string;

  beforeAll(async () => {
    await app.ready();

    await db.deleteFrom('syllabus_weeks').execute();
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    const school = await db
      .insertInto('schools')
      .values({ name: 'Syllabus Test Academy' })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-syllabus-test@school.edu',
        password_hash: pwHash,
        name: 'Syllabus Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const unauthorizedTeacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-syllabus-unauth@school.edu',
        password_hash: pwHash,
        name: 'Unauthorized Syllabus Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    unauthorizedTeacherToken = signAccessToken({
      sub: unauthorizedTeacher.id,
      email: unauthorizedTeacher.email,
      role: 'teacher',
      school_id: schoolId, token_version: 0, onboarding_completed: true });

    const student = await db
      .insertInto('users')
      .values({
        email: 'student-syllabus-test@school.edu',
        password_hash: pwHash,
        name: 'Syllabus Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Intro to Testing', code: 'SYLL-TEST-1' })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    await db
      .insertInto('student_enrollments')
      .values({ class_id: classId, student_id: student.id, status: 'active' })
      .execute();

    const otherClassroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Other Class', code: 'SYLL-TEST-2' })
      .returningAll()
      .executeTakeFirstOrThrow();
    otherClassId = otherClassroom.id;

    const assignment = await db
      .insertInto('assignments')
      .values({ class_id: classId, title: 'Week 1 Lab', rubric: JSON.stringify([{ criterion: 'Effort', max_points: 10 }]) })
      .returningAll()
      .executeTakeFirstOrThrow();
    assignmentId = assignment.id;

    const otherAssignment = await db
      .insertInto('assignments')
      .values({ class_id: otherClassId, title: 'Cross-class assignment', rubric: JSON.stringify([{ criterion: 'X', max_points: 10 }]) })
      .returningAll()
      .executeTakeFirstOrThrow();
    otherClassAssignmentId = otherAssignment.id;
  });

  afterAll(async () => {
    await db.deleteFrom('syllabus_weeks').execute();
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  it('should deny creating a syllabus week for Student', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      payload: { week_number: 1, title: 'Week One' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should deny creating a syllabus week for a teacher who does not own the class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}` },
      payload: { week_number: 1, title: 'Week One' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should reject linked_assignment_id that belongs to a different class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { week_number: 1, title: 'Week One', linked_assignment_id: otherClassAssignmentId },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should successfully create a syllabus week with a real linked assignment (Teacher)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: {
        week_number: 1,
        title: 'Week One: Foundations',
        topics: 'Intro topics',
        readings: 'Chapter 1',
        video_links: ['Intro video'],
        linked_assignment_id: assignmentId,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('Week One: Foundations');
    expect(body.linked_assignment_id).toBe(assignmentId);
    expect(body.video_links).toEqual(['Intro video']);

    weekId = body.id;
  });

  it('should reject a second week with a duplicate week_number for the same class', async () => {
    // The unique (class_id, week_number) constraint is the real backstop here;
    // app.ts's global error handler maps the resulting Postgres 23505 to a
    // clean 409 rather than leaking a raw 500.
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { week_number: 1, title: 'Duplicate Week One' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('should let an enrolled student list syllabus weeks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(weekId);
  });

  it('should update a syllabus week (Teacher)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/syllabus-weeks/${weekId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { title: 'Week One: Revised', video_links: ['Updated video'] },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('Week One: Revised');
    expect(body.video_links).toEqual(['Updated video']);
  });

  it('should deny updating a syllabus week for a non-owner teacher', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/syllabus-weeks/${weekId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}` },
      payload: { title: 'Hijacked Title' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should return 404 when updating a non-existent syllabus week', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/syllabus-weeks/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { title: 'Ghost Week' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should update the class syllabus_overview (Teacher)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}/syllabus-overview`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { syllabus_overview: 'Textbook: Real Learning 101.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().syllabus_overview).toBe('Textbook: Real Learning 101.');
  });

  it('should deny updating syllabus_overview for Student', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}/syllabus-overview`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      payload: { syllabus_overview: 'Hacked overview' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should delete a syllabus week (Teacher)', async () => {
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/syllabus-weeks/${weekId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/syllabus-weeks`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(listResponse.json().length).toBe(0);
  });

  it('should return 404 when deleting a non-existent syllabus week', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/syllabus-weeks/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
