import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Assignments Routes Integration', () => {
  const app = buildApp();
  
  let schoolId: string;
  let teacherId: string;
  let studentId: string;

  let teacherToken: string;
  let studentToken: string;
  let unauthorizedTeacherToken: string;
  
  let classId: string;
  let assignmentId: string;

  beforeAll(async () => {
    await app.ready();

    // Clean up
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    // Create Admin
    const admin = await db
      .insertInto('users')
      .values({
        email: 'admin-assign-test@school.edu',
        password_hash: pwHash,
        name: 'Admin User',
        role: 'admin',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create School
    const school = await db
      .insertInto('schools')
      .values({
        name: 'Test Academy',
        address: '123 Test St',
        created_by: admin.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    // Create Teacher
    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-assign-test@school.edu',
        password_hash: pwHash,
        name: 'Teacher User',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create Unauthorized Teacher
    const unauthorizedTeacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-unauth-assign-test@school.edu',
        password_hash: pwHash,
        name: 'Unauthorized Teacher User',
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

    // Create Student
    const student = await db
      .insertInto('users')
      .values({
        email: 'student-assign-test@school.edu',
        password_hash: pwHash,
        name: 'Student User',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentId = student.id;
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create Class taught by `teacher`
    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'AP Calculus BC',
        code: 'AP-CALC-BC',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    // Enroll student in class
    await db
      .insertInto('student_enrollments')
      .values({
        class_id: classId,
        student_id: studentId,
        status: 'active',
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom('assignments').execute();
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  it('should successfully create an assignment with a valid rubric (Teacher)', async () => {
    const rubricPayload = [
      { criterion: 'Formatting & Style', max_points: 20 },
      { criterion: 'Mathematical Correctness', max_points: 60 },
      { criterion: 'Explanations & Logic', max_points: 20 },
    ];

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'Problem Set 1',
        description: 'Covers limits and derivatives.',
        due_date: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days from now
        rubric: rubricPayload,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Problem Set 1');
    expect(body.class_id).toBe(classId);
    
    // Rubric is stored as JSONB, returned as a parsed array
    expect(body.rubric).toBeDefined();
    expect(body.rubric.length).toBe(3);
    expect(body.rubric[1].criterion).toBe('Mathematical Correctness');
    expect(body.rubric[1].max_points).toBe(60);

    assignmentId = body.id;
  });

  it('should fallback to null due_date if invalid date string is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'Problem Set 1 with bad date',
        description: 'Covers limits and derivatives.',
        due_date: 'invalid-date-string-abc',
        rubric: [{ criterion: 'Formatting & Style', max_points: 100 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.due_date).toBeNull();
  });

  it('should reject assignment creation if rubric is missing or empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'Invalid Assignment',
        rubric: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should deny assignment creation for Student', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        title: 'Student Attempted Assignment',
        rubric: [{ criterion: 'Failure', max_points: 10 }],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should deny assignment creation for unauthorized Teacher (who does not teach the class)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}`,
      },
      payload: {
        title: 'Another Teacher Attempt',
        rubric: [{ criterion: 'Interference', max_points: 100 }],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should successfully get class assignments (Student)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].id).toBe(assignmentId);
  });

  it('should successfully get assignment details by ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Problem Set 1');
    expect(body.id).toBe(assignmentId);
  });

  it('should successfully update assignment details (Teacher)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'Problem Set 1 (Revised)',
        description: 'New hints added.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Problem Set 1 (Revised)');
    expect(body.description).toBe('New hints added.');
  });

  it('should deny updating assignment details for Student', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        title: 'Hacked Title',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return 404 for non-existent assignment by ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/00000000-0000-0000-0000-000000000000`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should return 404 when updating non-existent assignment', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/00000000-0000-0000-0000-000000000000`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'New Title',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny non-owner teacher from updating assignment', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}`,
      },
      payload: {
        title: 'New Title',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should deny updating assignment with empty title', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: '   ',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny updating assignment with empty rubric list', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric: [],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny updating assignment with invalid rubric criterion name', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric: [{ criterion: '   ', max_points: 20 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny updating assignment with non-positive rubric points', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric: [{ criterion: 'Content', max_points: -5 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should allow no-op assignment update', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
  });

  it('should deny creating assignment with empty title', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: '  ',
        rubric: [{ criterion: 'Grammar', max_points: 10 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny creating assignment with invalid rubric criterion name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'New',
        rubric: [{ criterion: '  ', max_points: 10 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny creating assignment with non-positive rubric points', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'New',
        rubric: [{ criterion: 'Grammar', max_points: 0 }],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny getting assignments of class for non-enrolled student', async () => {
    const pwHash = await hashPassword('password123');
    const nonEnrolledStudent = await db
      .insertInto('users')
      .values({
        email: 'student-non-enrolled-assigns@school.edu',
        password_hash: pwHash,
        name: 'Non Enrolled Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const nonEnrolledToken = signAccessToken({ sub: nonEnrolledStudent.id, email: nonEnrolledStudent.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${nonEnrolledToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', nonEnrolledStudent.id).execute();
  });

  it('should successfully update assignment details including rubric (Teacher)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric: [
          { criterion: 'New Format', max_points: 30 },
          { criterion: 'New Math', max_points: 70 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.rubric).toBeDefined();
    expect(body.rubric[0].criterion).toBe('New Format');
  });

  it('should successfully update assignment due_date to null', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        due_date: null,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().due_date).toBeNull();
  });

  it('should return 404 when listing assignments for non-existent class', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/00000000-0000-0000-0000-000000000000/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should successfully create an assignment without description and due_date', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/assignments`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        title: 'Simple Assignment',
        rubric: [
          { criterion: 'Completeness', max_points: 100 },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.description).toBeNull();
    expect(body.due_date).toBeNull();

    // Clean up
    await db.deleteFrom('assignments').where('id', '=', body.id).execute();
  });

  it('should successfully update assignment due_date to a valid date', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/assignments/${assignmentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        due_date: '2026-12-31T23:59:59.000Z',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().due_date).toBe('2026-12-31T23:59:59.000Z');
  });

  it('should allow teacher to delete an assignment', async () => {
    // Create temporary assignment
    const assign = await db
      .insertInto('assignments')
      .values({
        class_id: classId,
        title: 'Delete Me',
        description: 'To be deleted',
        rubric: JSON.stringify([{ criterion: 'Cleanliness', max_points: 10 }]),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Delete assignment
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assign.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(204);

    // Verify deletion
    const verifyResponse = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assign.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(verifyResponse.statusCode).toBe(404);
  });

  it('should return 404 when deleting a non-existent assignment', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/assignments/00000000-0000-0000-0000-000000000000',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny deleting an assignment owned by another teacher', async () => {
    const assign = await db
      .insertInto('assignments')
      .values({
        class_id: classId,
        title: 'Protected Assignment',
        rubric: JSON.stringify([{ criterion: 'Cleanliness', max_points: 10 }]),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/assignments/${assign.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${unauthorizedTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('assignments').where('id', '=', assign.id).execute();
  });
});
