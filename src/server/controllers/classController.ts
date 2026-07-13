import { db } from '../db';
import { randomBytes } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import type { AuthUser } from '../types';

export interface CreateClassInput {
  school_id: string;
  name: string;
  description?: string | null;
  code?: string;
}

export async function getClasses(user: AuthUser) {
  if (user.role === 'admin') {
    return db.selectFrom('classes').selectAll().execute();
  }

  if (user.role === 'teacher') {
    return db
      .selectFrom('classes')
      .selectAll()
      .where('teacher_id', '=', user.id)
      .execute();
  }

  // Student role - return enrolled classes
  return db
    .selectFrom('classes')
    .innerJoin('student_enrollments', 'student_enrollments.class_id', 'classes.id')
    .select([
      'classes.id',
      'classes.school_id',
      'classes.teacher_id',
      'classes.name',
      'classes.description',
      'classes.code',
      'classes.created_at',
    ])
    .where('student_enrollments.student_id', '=', user.id)
    .where('student_enrollments.status', '=', 'active')
    .execute();
}

export async function getClassById(classId: string, user: AuthUser) {
  const classroom = await db
    .selectFrom('classes')
    .leftJoin('users', 'users.id', 'classes.teacher_id')
    .selectAll('classes')
    .select('users.name as teacher_name')
    .where('classes.id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  // Verify access permissions
  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ForbiddenError('You are not the teacher of this class');
  }

  if (user.role === 'student') {
    const isEnrolled = await db
      .selectFrom('student_enrollments')
      .select('id')
      .where('class_id', '=', classId)
      .where('student_id', '=', user.id)
      .where('status', '=', 'active')
      .executeTakeFirst();

    if (!isEnrolled) {
      throw new ForbiddenError('You are not enrolled in this class');
    }
  }

  return classroom;
}

export async function createClass(input: CreateClassInput, teacherId: string) {
  const generatedCode = randomBytes(4).toString('hex').toUpperCase();

  const codeToCheck = input.code || generatedCode;

  const codeExists = await db
    .selectFrom('classes')
    .select('id')
    .where('school_id', '=', input.school_id)
    .where('code', '=', codeToCheck)
    .executeTakeFirst();

  if (codeExists) {
    throw new ConflictError('Enrollment code already exists in this school');
  }

  return db
    .insertInto('classes')
    .values({
      school_id: input.school_id,
      teacher_id: teacherId,
      name: input.name,
      description: input.description ?? null,
      code: codeToCheck,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function enrollStudentInClass(classId: string, enrollmentCode: string, studentId: string) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'code', 'name'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  if (classroom.code !== enrollmentCode) {
    throw new ForbiddenError('Invalid enrollment code');
  }

  const existing = await db
    .selectFrom('student_enrollments')
    .selectAll()
    .where('class_id', '=', classId)
    .where('student_id', '=', studentId)
    .executeTakeFirst();

  if (existing) {
    if (existing.status === 'active') {
      throw new ConflictError('You are already enrolled in this class');
    }

    // Re-enroll previously dropped student
    return db
      .updateTable('student_enrollments')
      .set({ status: 'active' })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return db
    .insertInto('student_enrollments')
    .values({
      class_id: classId,
      student_id: studentId,
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getClassStudents(classId: string, user: AuthUser) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ForbiddenError('You are not the teacher of this class');
  }

  return db
    .selectFrom('student_enrollments')
    .innerJoin('users', 'users.id', 'student_enrollments.student_id')
    .select([
      'users.id as student_id',
      'users.name',
      'users.email',
      'student_enrollments.enrolled_at',
      'student_enrollments.status',
    ])
    .where('student_enrollments.class_id', '=', classId)
    .execute();
}

export async function getAvailableClassesForStudent(studentId: string, schoolId: string) {
  return db
    .selectFrom('classes')
    .innerJoin('users', 'users.id', 'classes.teacher_id')
    .select([
      'classes.id',
      'classes.name',
      'classes.description',
      'classes.code',
      'users.name as teacher_name',
    ])
    .where('classes.school_id', '=', schoolId)
    .where('classes.id', 'not in', (qb) =>
      qb
        .selectFrom('student_enrollments')
        .select('class_id')
        .where('student_id', '=', studentId)
        .where('status', '=', 'active')
    )
    .execute();
}

export async function deleteClass(classId: string, user: AuthUser) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ForbiddenError('You are not the teacher of this class');
  }

  await db.deleteFrom('classes').where('id', '=', classId).execute();
}

// Lets a teacher (for their own class) or admin (for any class) add a
// student directly, without the student needing the enrollment code — the
// "add students manually" half of enrollment (the code-based self-enroll
// flow is the other half, handled by enrollStudentInClass above).
export async function addStudentToClass(classId: string, studentId: string, user: AuthUser) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ForbiddenError('You are not the teacher of this class');
  }

  const student = await db
    .selectFrom('users')
    .select(['id', 'role'])
    .where('id', '=', studentId)
    .executeTakeFirst();

  if (!student || student.role !== 'student') {
    throw new ValidationError('User must be a student');
  }

  const existing = await db
    .selectFrom('student_enrollments')
    .selectAll()
    .where('class_id', '=', classId)
    .where('student_id', '=', studentId)
    .executeTakeFirst();

  if (existing) {
    if (existing.status === 'active') {
      throw new ConflictError('Student is already enrolled in this class');
    }

    return db
      .updateTable('student_enrollments')
      .set({ status: 'active' })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return db
    .insertInto('student_enrollments')
    .values({
      class_id: classId,
      student_id: studentId,
      status: 'active',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function removeStudentFromClass(classId: string, studentId: string, user: AuthUser) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'teacher_id'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  if (user.role === 'teacher' && classroom.teacher_id !== user.id) {
    throw new ForbiddenError('You are not the teacher of this class');
  }

  const enrollment = await db
    .selectFrom('student_enrollments')
    .select('id')
    .where('class_id', '=', classId)
    .where('student_id', '=', studentId)
    .executeTakeFirst();

  if (!enrollment) {
    throw new NotFoundError('Student enrollment not found in this class');
  }

  await db
    .deleteFrom('student_enrollments')
    .where('class_id', '=', classId)
    .where('student_id', '=', studentId)
    .execute();
}
