import { db } from '../db';
import { ForbiddenError, NotFoundError } from './errors';
import type { AuthUser } from '../types';

// Read-access check shared by every controller that scopes a resource to a
// class: a teacher must own it, a student must be actively enrolled, an
// admin always passes. Write operations layer `requireRole('teacher',
// 'admin')` on top of this at the route level - this function alone only
// answers "can this user see this class's data at all."
export async function verifyClassAccess(classId: string, user: AuthUser) {
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
