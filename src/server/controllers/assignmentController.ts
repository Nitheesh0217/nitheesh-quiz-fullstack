import type { Updateable } from 'kysely';
import { db } from '../db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { verifyClassAccess } from '../utils/classAccess';
import type { AuthUser } from '../types';
import type { AssignmentsTable, RubricCriterion } from '../db/types';

export interface CreateAssignmentInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  rubric: RubricCriterion[];
}

export interface UpdateAssignmentInput {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  rubric?: RubricCriterion[];
}

export async function getAssignments(classId: string, user: AuthUser) {
  await verifyClassAccess(classId, user);

  return db
    .selectFrom('assignments')
    .selectAll()
    .where('class_id', '=', classId)
    .execute();
}

export async function getAssignmentById(assignmentId: string, user: AuthUser) {
  const assignment = await db
    .selectFrom('assignments')
    .selectAll()
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  await verifyClassAccess(assignment.class_id, user);

  return assignment;
}

function parseDueDate(due_date?: string | null): Date | null {
  if (!due_date || due_date.trim() === '' || due_date === 'null' || due_date === 'undefined') {
    return null;
  }
  const parsed = new Date(due_date);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function createAssignment(classId: string, input: CreateAssignmentInput, user: AuthUser) {
  await verifyClassAccess(classId, user);

  if (!input.title || input.title.trim() === '') {
    throw new ValidationError('Assignment title is required');
  }

  for (const criterion of input.rubric) {
    if (criterion.criterion.trim() === '') {
      throw new ValidationError('Each rubric criterion must have a name');
    }
  }

  return db
    .insertInto('assignments')
    .values({
      class_id: classId,
      title: input.title,
      description: input.description ?? null,
      due_date: parseDueDate(input.due_date),
      rubric: JSON.stringify(input.rubric),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateAssignment(assignmentId: string, input: UpdateAssignmentInput, user: AuthUser) {
  const assignment = await db
    .selectFrom('assignments')
    .selectAll()
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  await verifyClassAccess(assignment.class_id, user);

  const updatePayload: Updateable<AssignmentsTable> = {};

  if (input.title !== undefined) {
    if (input.title.trim() === '') {
      throw new ValidationError('Assignment title is required');
    }
    updatePayload.title = input.title;
  }

  if (input.description !== undefined) {
    updatePayload.description = input.description;
  }

  if (input.due_date !== undefined) {
    updatePayload.due_date = parseDueDate(input.due_date);
  }

  if (input.rubric !== undefined) {
    for (const criterion of input.rubric) {
      if (criterion.criterion.trim() === '') {
        throw new ValidationError('Each rubric criterion must have a name');
      }
    }
    updatePayload.rubric = JSON.stringify(input.rubric);
  }

  if (Object.keys(updatePayload).length === 0) {
    return assignment;
  }

  return db
    .updateTable('assignments')
    .set(updatePayload)
    .where('id', '=', assignmentId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteAssignment(assignmentId: string, user: AuthUser) {
  const assignment = await db
    .selectFrom('assignments')
    .selectAll()
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }

  // verify the user is the teacher or admin for the class
  await verifyClassAccess(assignment.class_id, user);

  await db
    .deleteFrom('assignments')
    .where('id', '=', assignmentId)
    .execute();
}
