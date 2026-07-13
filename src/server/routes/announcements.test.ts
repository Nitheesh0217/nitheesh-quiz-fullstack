import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Class Announcements Routes Integration', () => {
  const app = buildApp();

  let schoolId: string;
  let teacherId: string;
  let teacherToken: string;
  let unauthorizedTeacherToken: string;
  let studentToken: string;
  let nonEnrolledStudentToken: string;

  let classId: string;
  let announcementId: string;

  beforeAll(async () => {
    await app.ready();

    await db.deleteFrom('class_announcements').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    const school = await db
      .insertInto('schools')
      .values({ name: 'Announcements Test Academy' })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-announce-test@school.edu',
        password_hash: pwHash,
        name: 'Announcing Teacher',
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
        email: 'teacher-announce-unauth@school.edu',
        password_hash: pwHash,
        name: 'Unauthorized Announcing Teacher',
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
        email: 'student-announce-test@school.edu',
        password_hash: pwHash,
        name: 'Announce Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const nonEnrolledStudent = await db
      .insertInto('users')
      .values({
        email: 'student-announce-not-enrolled@school.edu',
        password_hash: pwHash,
        name: 'Not Enrolled Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    nonEnrolledStudentToken = signAccessToken({
      sub: nonEnrolledStudent.id,
      email: nonEnrolledStudent.email,
      role: 'student',
      school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Announcements 101', code: 'ANNOUNCE-TEST-1' })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    await db
      .insertInto('student_enrollments')
      .values({ class_id: classId, student_id: student.id, status: 'active' })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom('class_announcements').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  it('should deny posting an announcement for Student', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
      payload: { title: 'Hacked Announcement', content: 'Should not work' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should deny posting an announcement for a teacher who does not own the class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}` },
      payload: { title: 'Interloper Announcement', content: 'Should not work' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should successfully post an announcement (Teacher), with author_id taken from the session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { title: 'Welcome!', content: 'Glad to have you all here.' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('Welcome!');
    expect(body.author_id).toBe(teacherId);

    announcementId = body.id;
  });

  it('should let an enrolled student list announcements with the real author name joined in', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(announcementId);
    expect(body[0].author_name).toBe('Announcing Teacher');
  });

  it('should deny a non-enrolled student from listing announcements', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${nonEnrolledStudentToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should update an announcement (Teacher)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/announcements/${announcementId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { title: 'Welcome! (Updated)' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('Welcome! (Updated)');
  });

  it('should deny updating an announcement for a non-owner teacher', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/announcements/${announcementId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}` },
      payload: { title: 'Hijacked' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should return 404 when updating a non-existent announcement', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/announcements/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
      payload: { title: 'Ghost' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should delete an announcement (Teacher)', async () => {
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/announcements/${announcementId}`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/announcements`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(listResponse.json().length).toBe(0);
  });

  it('should return 404 when deleting a non-existent announcement', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/announcements/00000000-0000-0000-0000-000000000000`,
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
