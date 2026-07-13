import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Submissions and Grading Integration', () => {
  const app = buildApp();
  
  let schoolId: string;
  let teacherId: string;
  let studentId: string;
  let otherStudentId: string;
  
  let teacherToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  
  let classId: string;
  let assignmentId: string;
  let submissionId: string;
  let gradeId: string;

  beforeAll(async () => {
    await app.ready();

    // Clean up
    await db.deleteFrom('grades').execute();
    await db.deleteFrom('submissions').execute();
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
        email: 'admin-grade-test@school.edu',
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
        email: 'teacher-grade-test@school.edu',
        password_hash: pwHash,
        name: 'Teacher User',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create Student
    const student = await db
      .insertInto('users')
      .values({
        email: 'student-grade-test@school.edu',
        password_hash: pwHash,
        name: 'Student User',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    studentId = student.id;
    studentToken = signAccessToken({ sub: student.id, email: student.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create Other Student (to check isolation)
    const otherStudent = await db
      .insertInto('users')
      .values({
        email: 'student-other-grade-test@school.edu',
        password_hash: pwHash,
        name: 'Other Student User',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    otherStudentId = otherStudent.id;
    otherStudentToken = signAccessToken({
      sub: otherStudent.id,
      email: otherStudent.email,
      role: 'student',
      school_id: schoolId, token_version: 0, onboarding_completed: true });

    // Create Class
    const classroom = await db
      .insertInto('classes')
      .values({
        school_id: schoolId,
        teacher_id: teacherId,
        name: 'English Literature',
        code: 'ENG-101',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    classId = classroom.id;

    // Enroll students in class
    await db
      .insertInto('student_enrollments')
      .values([
        { class_id: classId, student_id: studentId, status: 'active' },
        { class_id: classId, student_id: otherStudentId, status: 'active' },
      ])
      .execute();

    // Create Assignment with rubric
    const assignment = await db
      .insertInto('assignments')
      .values({
        class_id: classId,
        title: 'Shakespeare Essay',
        description: 'Analyze Hamlet.',
        rubric: JSON.stringify([
          { criterion: 'Grammar', max_points: 20 },
          { criterion: 'Content', max_points: 50 },
          { criterion: 'Structure', max_points: 30 },
        ]),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    assignmentId = assignment.id;
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

  it('should successfully submit an assignment (Student)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: '/uploads/submissions/essay.pdf',
        text_content: 'This is my essay on Hamlet.',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('submitted');
    expect(body.text_content).toBe('This is my essay on Hamlet.');
    expect(body.student_id).toBe(studentId);

    submissionId = body.id;
  });

  it('should allow student to overwrite their submission before it is graded', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: '/uploads/submissions/essay_revised.pdf',
        text_content: 'Revised: This is my essay on Hamlet.',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(submissionId); // Ensure same submission record updated
    expect(body.text_content).toBe('Revised: This is my essay on Hamlet.');
  });

  it('should successfully retrieve submissions list (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentId}/submissions`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(submissionId);
    expect(body[0].student_name).toBe('Student User');
  });

  it('should restrict student from viewing submissions list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentId}/submissions`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should successfully grade submission (Teacher)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Grammar', score: 18 },
          { criterion: 'Content', score: 45 },
          { criterion: 'Structure', score: 25 },
        ],
        feedback: 'Excellent work, very detailed analysis.',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.submission_id).toBe(submissionId);
    expect(body.feedback).toBe('Excellent work, very detailed analysis.');
    
    // total_score should be auto-calculated sum: 18 + 45 + 25 = 88
    expect(Number(body.total_score)).toBe(88);

    gradeId = body.id;
  });

  it('should reject grading with score out of bounds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Grammar', score: 25 }, // Max points is 20
        ],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should fetch own grade (Student)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe(gradeId);
    expect(Number(body.total_score)).toBe(88);
    expect(body.feedback).toBe('Excellent work, very detailed analysis.');
  });

  it('should restrict student from viewing another student\'s grade', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherStudentToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should fetch class grades summary (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0].student_name).toBe('Student User');
    expect(Number(body[0].total_score)).toBe(88);
  });

  it('should block non-student from submitting assignment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        text_content: 'Teacher submitting assignment',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should return 404 when submitting non-existent assignment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/00000000-0000-0000-0000-000000000000/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        text_content: 'Some content',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should block non-enrolled student from submitting assignment', async () => {
    const pwHash = await hashPassword('password123');
    const nonEnrolledStudent = await db
      .insertInto('users')
      .values({
        email: 'student-non-enrolled@school.edu',
        password_hash: pwHash,
        name: 'Non Enrolled Student',
        role: 'student',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const nonEnrolledToken = signAccessToken({ sub: nonEnrolledStudent.id, email: nonEnrolledStudent.email, role: 'student', school_id: schoolId, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${nonEnrolledToken}`,
      },
      payload: {
        text_content: 'Some content',
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', nonEnrolledStudent.id).execute();
  });

  it('should reject submission with missing content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny re-submitting to a graded assignment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        text_content: 'New content after grade',
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('should return 404 when listing submissions of non-existent assignment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/00000000-0000-0000-0000-000000000000/submissions`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should block student from listing submissions of assignment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/assignments/${assignmentId}/submissions`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should deny non-owner teacher from listing submissions', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-subs@school.edu',
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
      url: `/api/assignments/${assignmentId}/submissions`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should return 404 for non-existent submission by ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/00000000-0000-0000-0000-000000000000`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny non-owner teacher from getting submission by ID', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-sub-id@school.edu',
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
      url: `/api/submissions/${submissionId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should return 404 when grading non-existent submission', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/00000000-0000-0000-0000-000000000000/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Grammar', score: 15 },
        ],
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should update an existing grade on re-grading', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Grammar', score: 19 },
          { criterion: 'Content', score: 48 },
          { criterion: 'Structure', score: 25 },
        ],
        feedback: 'Updated feedback.',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(Number(body.total_score)).toBe(92);
    expect(body.feedback).toBe('Updated feedback.');
  });

  it('should return 404 when fetching grade of non-existent submission', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/00000000-0000-0000-0000-000000000000/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny non-owner teacher from viewing grade', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'other-teacher-view-grade@school.edu',
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
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should deny student from fetching class grades summary if not enrolled', async () => {
    const pwHash = await hashPassword('password123');
    const nonEnrolledStudent = await db
      .insertInto('users')
      .values({
        email: 'student-non-enrolled-grades@school.edu',
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
      url: `/api/classes/${classId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${nonEnrolledToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', nonEnrolledStudent.id).execute();
  });

  it('should successfully fetch details of specific submission by ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(submissionId);
  });

  it('should fetch own grades across classes (Student)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/grades?student_id=${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should block student from fetching another student\'s grades across classes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/grades?student_id=${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherStudentToken}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should fetch student grades across classes (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/grades?student_id=${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should block teacher from fetching grades of a student not in their classes', async () => {
    const pwHash = await hashPassword('password123');
    const otherTeacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-no-students@school.edu',
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
      url: `/api/grades?student_id=${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherTeacherToken}`,
      },
    });
    expect(response.statusCode).toBe(403);

    // Clean up
    await db.deleteFrom('users').where('id', '=', otherTeacher.id).execute();
  });

  it('should successfully get class grades (Student)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should successfully get class grades (Admin)', async () => {
    const adminUser = await db
      .selectFrom('users')
      .selectAll()
      .where('role', '=', 'admin')
      .executeTakeFirst();
    const adminToken = signAccessToken({ sub: adminUser!.id, email: adminUser!.email, role: 'admin', school_id: null, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/classes/${classId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should successfully get student grades across classes (Admin)', async () => {
    const adminUser = await db
      .selectFrom('users')
      .selectAll()
      .where('role', '=', 'admin')
      .executeTakeFirst();
    const adminToken = signAccessToken({ sub: adminUser!.id, email: adminUser!.email, role: 'admin', school_id: null, token_version: 0, onboarding_completed: true });

    const response = await app.inject({
      method: 'GET',
      url: `/api/grades?student_id=${studentId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${adminToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should deny submitting to an assignment that has already been graded', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        text_content: 'another attempt',
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('should deny grading with a score exceeding max points', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Content', score: 150 }, // max points is 100
        ],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should return 404 for non-existent submission grades', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/00000000-0000-0000-0000-000000000000/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should deny student from viewing another student\'s grade', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherStudentToken}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should successfully get submission grade details (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().submission_id).toBe(submissionId);
  });

  it('should deny grading with a non-existent rubric criterion', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionId}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [
          { criterion: 'Non-existent Criterion', score: 10 },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should deny student from fetching another student\'s submission details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${otherStudentToken}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should successfully grade a submission with feedback omitted', async () => {
    // 1. Create a new assignment and submission
    const a = await db.insertInto('assignments').values({ class_id: classId, title: 'Feedback Test', rubric: JSON.stringify([{ criterion: 'C', max_points: 100 }]) }).returningAll().executeTakeFirstOrThrow();
    const s = await db.insertInto('submissions').values({ assignment_id: a.id, student_id: studentId, text_content: 'done', status: 'submitted' }).returningAll().executeTakeFirstOrThrow();

    // 2. Grade without feedback (inserts grade)
    const response1 = await app.inject({
      method: 'POST',
      url: `/api/submissions/${s.id}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [{ criterion: 'C', score: 85 }],
      },
    });
    expect(response1.statusCode).toBe(201);
    expect(response1.json().feedback).toBeNull();

    // 3. Grade again without feedback (updates grade)
    const response2 = await app.inject({
      method: 'POST',
      url: `/api/submissions/${s.id}/grades`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
      payload: {
        rubric_scores: [{ criterion: 'C', score: 95 }],
      },
    });
    expect(response2.statusCode).toBe(201);
    expect(response2.json().feedback).toBeNull();

    // Clean up
    await db.deleteFrom('grades').where('submission_id', '=', s.id).execute();
    await db.deleteFrom('submissions').where('id', '=', s.id).execute();
    await db.deleteFrom('assignments').where('id', '=', a.id).execute();
  });

  it('should deny submitting with neither file_url nor text_content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${assignmentId}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('should successfully submit with file_url null and text_content defined', async () => {
    const a = await db.insertInto('assignments').values({ class_id: classId, title: 'Submit Branch Test 1', rubric: JSON.stringify([]) }).returningAll().executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'POST',
      url: `/api/assignments/${a.id}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: null,
        text_content: 'Some answers',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.file_url).toBeNull();
    expect(body.text_content).toBe('Some answers');

    // Clean up
    await db.deleteFrom('submissions').where('id', '=', body.id).execute();
    await db.deleteFrom('assignments').where('id', '=', a.id).execute();
  });

  it('should successfully submit and re-submit to test all null/defined branches', async () => {
    const a = await db.insertInto('assignments').values({ class_id: classId, title: 'Submit Branch Test 2', rubric: JSON.stringify([]) }).returningAll().executeTakeFirstOrThrow();

    // 1. Submit with file_url defined and text_content null
    const response1 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${a.id}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: 'https://example.com/homework.pdf',
        text_content: null,
      },
    });
    expect(response1.statusCode).toBe(201);
    const body1 = response1.json();
    expect(body1.file_url).toBe('https://example.com/homework.pdf');
    expect(body1.text_content).toBeNull();

    // 2. Re-submit with file_url null and text_content defined (updates previous)
    const response2 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${a.id}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: null,
        text_content: 'New answers',
      },
    });
    expect(response2.statusCode).toBe(201);
    const body2 = response2.json();
    expect(body2.file_url).toBeNull();
    expect(body2.text_content).toBe('New answers');

    // 3. Re-submit with file_url defined and text_content null (updates previous)
    const response3 = await app.inject({
      method: 'POST',
      url: `/api/assignments/${a.id}/submit`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${studentToken}`,
      },
      payload: {
        file_url: 'https://example.com/homework-final.pdf',
        text_content: null,
      },
    });
    expect(response3.statusCode).toBe(201);
    const body3 = response3.json();
    expect(body3.file_url).toBe('https://example.com/homework-final.pdf');
    expect(body3.text_content).toBeNull();

    // Clean up
    await db.deleteFrom('submissions').where('id', '=', body3.id).execute();
    await db.deleteFrom('assignments').where('id', '=', a.id).execute();
  });

  it('should successfully retrieve submission by ID (Teacher)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionId}`,
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${teacherToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(submissionId);
  });
});
