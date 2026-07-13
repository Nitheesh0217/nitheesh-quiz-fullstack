import { db } from '../db';
import { NotFoundError } from '../utils/errors';

export async function getAverageGrades() {
  const result = await db
    .selectFrom('grades')
    .select((eb) => eb.fn.avg('total_score').as('average'))
    .executeTakeFirst();

  return {
    average: result?.average ? Number(result.average) : null,
  };
}

export async function getAverageGradeForClass(classId: string) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'name'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  const result = await db
    .selectFrom('grades')
    .select((eb) => eb.fn.avg('total_score').as('average'))
    .where('class_id', '=', classId)
    .executeTakeFirst();

  return {
    class_id: classroom.id,
    class_name: classroom.name,
    average: result?.average ? Number(result.average) : null,
  };
}

export async function getTeacherNames() {
  const teachers = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .where('role', '=', 'teacher')
    .execute();

  return teachers;
}

export async function getStudentNames() {
  const students = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .where('role', '=', 'student')
    .execute();

  return students;
}

export async function getAllClasses() {
  const classes = await db
    .selectFrom('classes')
    .innerJoin('users', 'users.id', 'classes.teacher_id')
    .select([
      'classes.id',
      'classes.name',
      'classes.code',
      'classes.teacher_id',
      'users.name as teacher_name',
    ])
    .execute();

  return classes;
}

export async function getClassStudentsList(classId: string) {
  const classroom = await db
    .selectFrom('classes')
    .select(['id', 'name'])
    .where('id', '=', classId)
    .executeTakeFirst();

  if (!classroom) {
    throw new NotFoundError('Class not found');
  }

  // Deliberately omits email: this endpoint is readable by any authenticated
  // role for any class (see stats.ts), so it returns just enough to satisfy
  // SPECS.md's "list of all students in a given class" without exposing
  // contact info across class/role boundaries.
  const students = await db
    .selectFrom('student_enrollments')
    .innerJoin('users', 'users.id', 'student_enrollments.student_id')
    .select(['users.id', 'users.name'])
    .where('student_enrollments.class_id', '=', classId)
    .where('student_enrollments.status', '=', 'active')
    .execute();

  return {
    class_id: classroom.id,
    class_name: classroom.name,
    students,
  };
}
