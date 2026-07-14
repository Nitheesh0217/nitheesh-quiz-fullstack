import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { signAccessToken } from '../utils/jwt';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';
import { hashPassword } from '../utils/password';

describe('Admin Routes Integration', () => {
  const app = buildApp();
  
  let schoolId: string;
  let teacherId: string;
  let adminId: string;
  let adminToken: string;
  let teacherToken: string;
  let testGroup_id: string;

  beforeAll(async () => {
    await app.ready();

    // Clean up
    await db.deleteFrom('teacher_group_members').execute();
    await db.deleteFrom('teacher_groups').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();

    const pwHash = await hashPassword('password123');

    // Create a mock admin user
    const admin = await db
      .insertInto('users')
      .values({
        email: 'admin-test@school.edu',
        password_hash: pwHash,
        name: 'Admin User',
        role: 'admin',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    adminId = admin.id;
    adminToken = signAccessToken({ sub: admin.id, email: admin.email, role: 'admin', school_id: null, token_version: 0, onboarding_completed: true });

    // Create a mock school
    const school = await db
      .insertInto('schools')
      .values({
        name: 'Admin Academy',
        address: '123 Admin St',
        created_by: admin.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    schoolId = school.id;

    // Create a teacher user
    const teacher = await db
      .insertInto('users')
      .values({
        email: 'teacher-test@school.edu',
        password_hash: pwHash,
        name: 'Teacher User',
        role: 'teacher',
        school_id: schoolId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    teacherId = teacher.id;
    teacherToken = signAccessToken({ sub: teacher.id, email: teacher.email, role: 'teacher', school_id: schoolId, token_version: 0, onboarding_completed: true });
  });

  afterAll(async () => {
    await db.deleteFrom('teacher_group_members').execute();
    await db.deleteFrom('teacher_groups').execute();
    await db.deleteFrom('schools').execute();
    await db.deleteFrom('users').execute();
    await app.close();
    await db.destroy();
  });

  it('should list all users for admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const users = response.json();
    expect(users.length).toBeGreaterThanOrEqual(2);
    const adminUser = users.find((u: any) => u.id === adminId);
    expect(adminUser).toBeDefined();
    expect(adminUser.is_suspended).toBe(false);
  });

  it('should block non-admins from admin users list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: teacherToken,
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should toggle user suspension status', async () => {
    // Suspend the teacher
    const suspendRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${teacherId}/suspend`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ is_suspended: true }),
    });

    expect(suspendRes.statusCode).toBe(200);
    expect(suspendRes.json().is_suspended).toBe(true);

    // Verify in db
    const userInDb = await db.selectFrom('users').selectAll().where('id', '=', teacherId).executeTakeFirst();
    expect(userInDb?.is_suspended).toBe(true);

    // Unsuspend the teacher
    const unsuspendRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${teacherId}/suspend`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ is_suspended: false }),
    });

    expect(unsuspendRes.statusCode).toBe(200);
    expect(unsuspendRes.json().is_suspended).toBe(false);
  });

  it('should return 400 Validation Error for non-UUID suspension paths', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/not-a-uuid/suspend',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ is_suspended: true }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('should create a teacher group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/teacher-groups',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        school_id: schoolId,
        name: 'Math Department',
      }),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('Math Department');
    expect(body.school_id).toBe(schoolId);
    testGroup_id = body.id;
  });

  it('should list teacher groups', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/teacher-groups?school_id=${schoolId}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const groups = response.json();
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Math Department');
  });

  it('should add a teacher to a teacher group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/teacher-groups/${testGroup_id}/members`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        teacher_id: teacherId,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().group_id).toBe(testGroup_id);
    expect(response.json().teacher_id).toBe(teacherId);
  });

  it('should fetch teacher group details with members', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/teacher-groups/${testGroup_id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.name).toBe('Math Department');
    expect(body.members.length).toBe(1);
    expect(body.members[0].id).toBe(teacherId);
    expect(body.members[0].name).toBe('Teacher User');
  });

  it('should update teacher group name', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/teacher-groups/${testGroup_id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Science Department',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('Science Department');
  });

  it('should remove a teacher from a group', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/teacher-groups/${testGroup_id}/members/${teacherId}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(204);

    // Verify members are empty
    const checkResponse = await app.inject({
      method: 'GET',
      url: `/api/admin/teacher-groups/${testGroup_id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(checkResponse.json().members.length).toBe(0);
  });

  it('should delete a teacher group', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/teacher-groups/${testGroup_id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(204);

    // Verify it is deleted
    const checkResponse = await app.inject({
      method: 'GET',
      url: `/api/admin/teacher-groups/${testGroup_id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(checkResponse.statusCode).toBe(404);
  });

  it('should return 404 when suspending non-existent user', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/00000000-0000-0000-0000-000000000000/suspend`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ is_suspended: true }),
    });
    expect(response.statusCode).toBe(404);
  });

  it('should list all teacher groups when school_id is not provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/teacher-groups',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(200);
  });

  it('should return 404 when getting non-existent teacher group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should return 404 when updating non-existent teacher group', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(response.statusCode).toBe(404);
  });

  it('should return 404 when deleting non-existent teacher group', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should return 400 when adding non-teacher user to group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000/members`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ teacher_id: adminId }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when adding non-existent member to group', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000/members`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ teacher_id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('should return 404 when removing non-existent membership', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/teacher-groups/00000000-0000-0000-0000-000000000000/members/00000000-0000-0000-0000-000000000000`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should successfully create a school (Admin)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/schools',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Horizon School' }),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('New Horizon School');

    // Clean up
    await db.deleteFrom('schools').where('id', '=', body.id).execute();
  });

  it('should successfully list schools (Admin)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/schools',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('should successfully calculate average grade across system (Admin)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/average-grades',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('average');
  });

  it('should successfully list users filtered by role (Admin)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users?role=teacher',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((u: any) => u.role === 'teacher')).toBe(true);
  });

  it('should return null system average grade when no grades exist (Admin)', async () => {
    // Temporarily clean up grades
    await db.deleteFrom('grades').execute();

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/average-grades',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().average).toBeNull();
  });

  it('should return system average grade percentage when grades exist (Admin)', async () => {
    // 1. Setup school, teacher, student, class, assignment, submission, grade
    const pwHash = await hashPassword('password123');
    const u = await db.insertInto('users').values({ email: 'admin-stats-u@school.edu', password_hash: pwHash, name: 'U', role: 'student' }).returningAll().executeTakeFirstOrThrow();
    const c = await db.insertInto('classes').values({ school_id: schoolId, teacher_id: teacherId, name: 'C', code: 'C-CODE' }).returningAll().executeTakeFirstOrThrow();
    const a = await db.insertInto('assignments').values({ class_id: c.id, title: 'A', rubric: JSON.stringify([]) }).returningAll().executeTakeFirstOrThrow();
    const s = await db.insertInto('submissions').values({ assignment_id: a.id, student_id: u.id, text_content: 'ans', status: 'graded' }).returningAll().executeTakeFirstOrThrow();
    await db.insertInto('grades').values({ submission_id: s.id, assignment_id: a.id, student_id: u.id, class_id: c.id, graded_by: teacherId, rubric_scores: JSON.stringify([]), total_score: '90' }).execute();

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/average-grades',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().average).toBe('90.0%');

    // Clean up
    await db.deleteFrom('grades').where('submission_id', '=', s.id).execute();
    await db.deleteFrom('submissions').where('id', '=', s.id).execute();
    await db.deleteFrom('assignments').where('id', '=', a.id).execute();
    await db.deleteFrom('classes').where('id', '=', c.id).execute();
    await db.deleteFrom('users').where('id', '=', u.id).execute();
  });

  it('should allow admin to create a new user and then delete them', async () => {
    const createUserResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: {
        email: 'admin-created-user@school.edu',
        password: 'admincreatedpassword123',
        name: 'Admin Created Student',
        role: 'student',
        school_id: schoolId,
      },
    });

    expect(createUserResponse.statusCode).toBe(201);
    const createdUser = createUserResponse.json();
    expect(createdUser.email).toBe('admin-created-user@school.edu');
    expect(createdUser.role).toBe('student');
    expect(createdUser.id).toBeDefined();

    const deleteUserResponse = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${createdUser.id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });

    expect(deleteUserResponse.statusCode).toBe(204);

    // Verify deletion
    const verifyResponse = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    const users = verifyResponse.json();
    const found = users.find((u: any) => u.id === createdUser.id);
    expect(found).toBeUndefined();
  });

  it('should allow admin to edit a user\'s name, email, and role', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: {
        email: 'edit-target@school.edu',
        password: 'editablepassword123',
        name: 'Edit Target',
        role: 'student',
        school_id: schoolId,
      },
    });
    const createdUser = createResponse.json();

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${createdUser.id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: {
        name: 'Edit Target (Updated)',
        email: 'edit-target-updated@school.edu',
        role: 'teacher',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json();
    expect(updated.name).toBe('Edit Target (Updated)');
    expect(updated.email).toBe('edit-target-updated@school.edu');
    expect(updated.role).toBe('teacher');

    await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${createdUser.id}`,
      cookies: { [ACCESS_TOKEN_COOKIE]: adminToken },
    });
  });

  it('should allow admin to update a user\'s email and school_id while leaving name and role untouched', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: {
        email: 'school-edit-target@school.edu',
        password: 'editablepassword123',
        name: 'School Edit Target',
        role: 'student',
        school_id: null,
      },
    });
    const createdUser = createResponse.json();

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${createdUser.id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: {
        email: 'school-edit-target-updated@school.edu',
        school_id: schoolId,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json();
    expect(updated.name).toBe('School Edit Target');
    expect(updated.email).toBe('school-edit-target-updated@school.edu');
    expect(updated.role).toBe('student');
    expect(updated.school_id).toBe(schoolId);

    await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${createdUser.id}`,
      cookies: { [ACCESS_TOKEN_COOKIE]: adminToken },
    });
  });

  it('should reject editing a user to an email already in use', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${adminId}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: { email: 'teacher-test@school.edu' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should return 404 when editing a non-existent user', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/admin/users/00000000-0000-0000-0000-000000000000',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
      payload: { name: 'Ghost User' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should block non-admins from editing users', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/users/${adminId}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: teacherToken,
      },
      payload: { name: 'Hijacked Name' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('should return 404 when deleting a non-existent user', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/users/00000000-0000-0000-0000-000000000000',
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('should block an admin from deleting their own account', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${adminId}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(409);

    // Verify the admin account still exists
    const stillExists = await db.selectFrom('users').select('id').where('id', '=', adminId).executeTakeFirst();
    expect(stillExists).toBeDefined();
  });

  it('should block deleting a teacher who still owns a class', async () => {
    const pwHash = await hashPassword('password123');
    const t = await db
      .insertInto('users')
      .values({ email: 'teacher-with-class@school.edu', password_hash: pwHash, name: 'T', role: 'teacher', school_id: schoolId })
      .returningAll()
      .executeTakeFirstOrThrow();
    const c = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: t.id, name: 'Owned Class', code: 'OWNED-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${t.id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(409);

    // Clean up
    await db.deleteFrom('classes').where('id', '=', c.id).execute();
    await db.deleteFrom('users').where('id', '=', t.id).execute();
  });

  it('should block deleting a teacher who has graded submissions', async () => {
    const pwHash = await hashPassword('password123');
    const t = await db
      .insertInto('users')
      .values({ email: 'teacher-with-grades@school.edu', password_hash: pwHash, name: 'T2', role: 'teacher', school_id: schoolId })
      .returningAll()
      .executeTakeFirstOrThrow();
    const student = await db
      .insertInto('users')
      .values({ email: 'student-for-grades@school.edu', password_hash: pwHash, name: 'S', role: 'student', school_id: schoolId })
      .returningAll()
      .executeTakeFirstOrThrow();
    const c = await db
      .insertInto('classes')
      .values({ school_id: schoolId, teacher_id: teacherId, name: 'Grading Class', code: 'GRADING-CODE' })
      .returningAll()
      .executeTakeFirstOrThrow();
    const a = await db
      .insertInto('assignments')
      .values({ class_id: c.id, title: 'Graded Assignment', rubric: JSON.stringify([]) })
      .returningAll()
      .executeTakeFirstOrThrow();
    const s = await db
      .insertInto('submissions')
      .values({ assignment_id: a.id, student_id: student.id, text_content: 'ans', status: 'graded' })
      .returningAll()
      .executeTakeFirstOrThrow();
    const g = await db
      .insertInto('grades')
      .values({
        submission_id: s.id,
        assignment_id: a.id,
        student_id: student.id,
        class_id: c.id,
        graded_by: t.id,
        rubric_scores: JSON.stringify([]),
        total_score: '90',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${t.id}`,
      cookies: {
        [ACCESS_TOKEN_COOKIE]: adminToken,
      },
    });
    expect(response.statusCode).toBe(409);

    // Clean up
    await db.deleteFrom('grades').where('id', '=', g.id).execute();
    await db.deleteFrom('submissions').where('id', '=', s.id).execute();
    await db.deleteFrom('assignments').where('id', '=', a.id).execute();
    await db.deleteFrom('classes').where('id', '=', c.id).execute();
    await db.deleteFrom('users').where('id', '=', t.id).execute();
    await db.deleteFrom('users').where('id', '=', student.id).execute();
  });
});
