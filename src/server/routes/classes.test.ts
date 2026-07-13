import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Classes Routes Integration', () => {
  const app = buildApp();
  
  let schoolId: string;
  let teacherId: string;
  let studentId: string;
  let teacherToken: string;
  let studentToken: string;
  let adminToken: string;
  
  let classId: string;
  let enrollmentCode: string;

  beforeAll(async () => {
    await app.ready();

    // Clean up
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    // Create a mock admin user
    const admin = await db
      .insertInto('users')
      .values({
        email: 'admin-class-test@school.edu',
        password_hash: pwHash,
        name: 'Admin User',
        role: 'admin',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    adminToken = signAccessToken({ sub: admin.id, email: admin.email, role: 'admin', school_id: null, token_version: 0, onboarding_completed: true });

    // Create a mock school
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

    // Create a teacher user
    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-class-test@school.edu',
        password_hash: pwHash,
        name: 'Teacher User',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create a student user
    const student = await db
      .insertInto('users')
      .values({
        email: 'student-class-test@school.edu',
        password_hash: pwHash,
        name: 'Student User',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentId = student.id;
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });
  });

  afterAll(async () => {
    await db.deleteFrom('student_enrollments').execute();
    await db.deleteFrom('classes').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  it('should successfully create a new class (Teacher)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Introduction to Physics',
        description: 'Basic Newtonian mechanics.',
        code: 'PHYS-101',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Introduction to Physics');
    expect(body.code).toBe('PHYS-101');
    expect(body.teacher_id).toBe(teacherId);
    
    classId = body.id;
    enrollmentCode = body.code;
  });

  it('should ignore a client-supplied school_id and scope a teacher-created class to their own school', async () => {
    const otherSchool = await db
      .insertInto('schools')
      .values({ name: 'Other Academy', address: '456 Other St' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        school_id: otherSchool.id,
        name: 'Cross-School Injection Attempt',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.school_id).toBe(schoolId);
    expect(body.school_id).not.toBe(otherSchool.id);

    await db.deleteFrom('classes').where('id', '=', body.id).execute();
    await db.deleteFrom('schools').where('id', '=', otherSchool.id).execute();
  });

  it('should update a class name and description (Teacher, owner)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        name: 'Introduction to Physics (Updated)',
        description: 'Now covers thermodynamics too.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Introduction to Physics (Updated)');
    expect(body.description).toBe('Now covers thermodynamics too.');
  });

  it('should update a class as Admin regardless of ownership', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
      payload: { name: 'Introduction to Physics (Admin Edit)' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).name).toBe('Introduction to Physics (Admin Edit)');
  });

  it('should deny updating a class for a non-owner teacher', async () => {
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-update-teacher@school.edu',
        password_hash: await hashPassword('password123'),
        name: 'Other Update Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
      payload: { name: 'Hijacked Name' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should deny a student updating a class', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: { name: 'Student Edit Attempt' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return 404 when updating a non-existent class', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/classes/00000000-0000-0000-0000-000000000000`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { name: 'Ghost Class' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should require teacher_id when Admin creates a class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Admin-Created Class Without Teacher',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('teacher_id is required');
  });

  it('should reject a teacher_id that does not reference a real teacher', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Admin-Created Class With Bad Teacher',
        teacher_id: studentId,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('must reference an existing teacher');
  });

  it('should let Admin create a class on behalf of a real teacher', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Admin-Created Class',
        teacher_id: teacherId,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.teacher_id).toBe(teacherId);

    await db.deleteFrom('classes').where('id', '=', body.id).execute();
  });

  it('should deny class creation for Student', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Chemistry 101',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should fetch classes for Teacher', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(classId);
  });

  it('should return empty classes list for Student before enrolling', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(0);
  });

  it('should enroll student in class using code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: enrollmentCode,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.enrollment.class_id).toBe(classId);
    expect(body.enrollment.student_id).toBe(studentId);
  });

  it('should fetch enrolled classes for Student after enrolling', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(classId);
  });

  it('should fetch all classes for Admin regardless of ownership or enrollment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(classId);
  });

  it('should fetch student list of a class (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].student_id).toBe(studentId);
    expect(body[0].name).toBe('Student User');
  });

  it('should deny fetching student list for Student role', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return available classes for student', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/classes/available',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('should return 404 when getting non-existent class', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/00000000-0000-0000-0000-000000000000`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny viewing class by non-owner teacher', async () => {
    const pwHash = await hashPassword('password123');
    // Create another teacher
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher@school.edu',
        password_hash: pwHash,
        name: 'Other Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up other teacher
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should deny viewing class by non-enrolled student', async () => {
    const pwHash = await hashPassword('password123');
    // Create another student
    const otherStudent = await db
      .insertInto('users')
      .values({
        email: 'other-student@school.edu',
        password_hash: pwHash,
        name: 'Other Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherStudentToken = signAccessToken({ sub: otherStudent.id, email: otherStudent.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherStudentToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up other student
    await db.deleteFrom('users').where('id', '=', otherStudent.id).execute();
  });

  it('should fail to create class with duplicate code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Introduction to Physics 2',
        code: enrollmentCode,
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('should return 404 when enrolling in non-existent class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/00000000-0000-0000-0000-000000000000/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: 'XYZ123',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny enrollment with invalid code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: 'WRONGCODE',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should deny enrolling twice in same class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: enrollmentCode,
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('should re-enroll dropped student', async () => {
    // Drop the student first in the db
    await db
      .updateTable('student_enrollments')
      .set({ status: 'dropped' })
      .where('class_id', '=', classId)
      .where('student_id', '=', studentId)
      .execute();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: enrollmentCode,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.enrollment.status).toBe('active');
  });

  it('should return 404 when getting student list of non-existent class', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/00000000-0000-0000-0000-000000000000/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny non-owner teacher from getting student list', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-students@school.edu',
        password_hash: pwHash,
        name: 'Other Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should successfully get class by ID (Student)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(classId);
  });

  it('should return empty list when getting available classes for student with no school', async () => {
    const pwHash = await hashPassword('password123');
    const studentWithNoSchool = await db
      .insertInto('users')
      .values({
        email: 'student-no-school@school.edu',
        password_hash: pwHash,
        name: 'No School Student',
        role: 'student',
        school_id: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const token = signAccessToken({ sub: studentWithNoSchool.id, email: studentWithNoSchool.email, role: 'student', school_id: null, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: '/api/classes/available',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${token}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    // Clean up
    await db.deleteFrom('users').where('id', '=', studentWithNoSchool.id).execute();
  });

  it('should successfully create a class without a code and with a description', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Introduction to Biology',
        description: 'Covers cells and ecosystems.',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Introduction to Biology');
    expect(body.description).toBe('Covers cells and ecosystems.');
    expect(body.code).toBeDefined();
    expect(body.code.length).toBe(8);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', body.id).execute();
  });

  it('should return 404 when enrolling in non-existent class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/00000000-0000-0000-0000-000000000000/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: 'ANYCODE',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should return 403 when enrolling with invalid enrollment code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classId}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: 'WRONGCODE',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should successfully re-enroll a student with dropped status', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'AP Chemistry',
        code: 'AP-CHEM',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('student_enrollments')
      .values({
        class_id: classroom.id,
        student_id: studentId,
        status: 'dropped',
      })
      .execute();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/enroll`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        enrollment_code: 'AP-CHEM',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.enrollment.status).toBe('active');

    // Clean up
    await db.deleteFrom('student_enrollments').where('class_id', '=', classroom.id).execute();
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should successfully create a class with description explicitly null', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        school_id: schoolId,
        name: 'Introduction to Chemistry',
        description: null,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.description).toBeNull();

    // Clean up
    await db.deleteFrom('classes').where('id', '=', body.id).execute();
  });

  it('should allow teacher to remove student and delete class', async () => {
    // Create class
    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'AP Biology',
        code: 'AP-BIO',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enroll student
    await db
      .insertInto('student_enrollments')
      .values({
        class_id: classroom.id,
        student_id: studentId,
        status: 'active',
      })
      .execute();

    // Remove student
    const removeResponse = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classroom.id}/students/${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(removeResponse.statusCode).toBe(204);

    // Verify student is removed
    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(listResponse.json()).toHaveLength(0);

    // Delete class
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classroom.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(deleteResponse.statusCode).toBe(204);

    // Verify class is deleted
    const verifyResponse = await app.inject({
      method: 'GET',
      url: `/api/classes/${classroom.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(verifyResponse.statusCode).toBe(404);
  });

  it('should return 404 when deleting a non-existent class', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/classes/00000000-0000-0000-0000-000000000000',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny deleting a class owned by another teacher', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-delete-class@school.edu',
        password_hash: pwHash,
        name: 'Other Teacher',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Protected Class', code: 'PROTECTED-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classroom.id}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should return 404 when removing a student from a non-existent class', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/classes/00000000-0000-0000-0000-000000000000/students/${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny removing a student from a class owned by another teacher', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-remove-student@school.edu',
        password_hash: pwHash,
        name: 'Other Teacher 2',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Another Protected Class', code: 'PROTECTED-CODE-2' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classroom.id}/students/${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should return 404 when removing a student who is not enrolled in the class', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Empty Class', code: 'EMPTY-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/classes/${classroom.id}/students/${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should allow a teacher to add a student directly to their own class', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Manual Add Class', code: 'MANUAL-ADD' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { student_id: studentId },
    });
    expect(response.statusCode).toBe(201);

    const roster = await app.inject({
      method: 'GET',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(roster.json().some((s: { student_id: string }) => s.student_id === studentId)).toBe(true);

    // Clean up
    await db.deleteFrom('student_enrollments').where('class_id', '=', classroom.id).execute();
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should re-activate a previously dropped enrollment when adding a student back', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Re-add Class', code: 'RE-ADD-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('student_enrollments')
      .values({ class_id: classroom.id, student_id: studentId, status: 'dropped' })
      .execute();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { student_id: studentId },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('active');

    // Clean up
    await db.deleteFrom('student_enrollments').where('class_id', '=', classroom.id).execute();
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should return 409 when adding a student already actively enrolled', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Already Enrolled Class', code: 'ALREADY-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto('student_enrollments')
      .values({ class_id: classroom.id, student_id: studentId, status: 'active' })
      .execute();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { student_id: studentId },
    });
    expect(response.statusCode).toBe(409);

    // Clean up
    await db.deleteFrom('student_enrollments').where('class_id', '=', classroom.id).execute();
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should return 400 when adding a non-student user to a class', async () => {
    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Invalid Add Class', code: 'INVALID-ADD' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { student_id: teacherId },
    });
    expect(response.statusCode).toBe(400);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
  });

  it('should return 404 when adding a student to a non-existent class', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/classes/00000000-0000-0000-0000-000000000000/students',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: { student_id: studentId },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny adding a student to a class owned by another teacher', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-add-student@school.edu',
        password_hash: pwHash,
        name: 'Other Teacher 3',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const otherTeacherToken = signAccessToken({ sub: otherTeacher.id, email: otherTeacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const classroom = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Protected Add Class', code: 'PROTECTED-ADD' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'POST',
      url: `/api/classes/${classroom.id}/students`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
      payload: { student_id: studentId },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', classroom.id).execute();
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });
});
