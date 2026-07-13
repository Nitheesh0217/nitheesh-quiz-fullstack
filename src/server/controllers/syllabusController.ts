import type { Updateable } from 'kysely';
import { db } from '../db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { verifyClassAccess } from '../utils/classAccess';
import type { AuthUser } from '../types';
import type { SyllabusWeeksTable } from '../db/types';

export interface CreateSyllabusWeekInput {
  week_number: number;
  title: string;
  topics?: string | null;
  readings?: string | null;
  video_links?: string[];
  linked_assignment_id?: string | null;
}

export interface UpdateSyllabusWeekInput {
  week_number?: number;
  title?: string;
  topics?: string | null;
  readings?: string | null;
  video_links?: string[];
  linked_assignment_id?: string | null;
}

async function verifyLinkedAssignment(classId: string, assignmentId: string | null | undefined): Promise<void> {
  if (!assignmentId) return;

  const assignment = await db
    .selectFrom('assignments')
    .select(['id', 'class_id'])
    .where('id', '=', assignmentId)
    .executeTakeFirst();

  if (!assignment || assignment.class_id !== classId) {
    throw new ValidationError('linked_assignment_id must reference an assignment in this same class');
  }
}

export async function getSyllabusWeeks(classId: string, user: AuthUser) {
  await verifyClassAccess(classId, user);

  return db
    .selectFrom('syllabus_weeks')
    .selectAll()
    .where('class_id', '=', classId)
    .orderBy('week_number', 'asc')
    .execute();
}

export async function createSyllabusWeek(classId: string, input: CreateSyllabusWeekInput, user: AuthUser) {
  await verifyClassAccess(classId, user);
  await verifyLinkedAssignment(classId, input.linked_assignment_id);

  return db
    .insertInto('syllabus_weeks')
    .values({
      class_id: classId,
      week_number: input.week_number,
      title: input.title,
      topics: input.topics ?? null,
      readings: input.readings ?? null,
      video_links: JSON.stringify(input.video_links ?? []),
      linked_assignment_id: input.linked_assignment_id ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateSyllabusWeek(weekId: string, input: UpdateSyllabusWeekInput, user: AuthUser) {
  const week = await db
    .selectFrom('syllabus_weeks')
    .selectAll()
    .where('id', '=', weekId)
    .executeTakeFirst();

  if (!week) {
    throw new NotFoundError('Syllabus week not found');
  }

  await verifyClassAccess(week.class_id, user);

  if (input.linked_assignment_id !== undefined) {
    await verifyLinkedAssignment(week.class_id, input.linked_assignment_id);
  }

  const updatePayload: Updateable<SyllabusWeeksTable> = { updated_at: new Date() };

  if (input.week_number !== undefined) updatePayload.week_number = input.week_number;
  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.topics !== undefined) updatePayload.topics = input.topics;
  if (input.readings !== undefined) updatePayload.readings = input.readings;
  if (input.video_links !== undefined) updatePayload.video_links = JSON.stringify(input.video_links);
  if (input.linked_assignment_id !== undefined) updatePayload.linked_assignment_id = input.linked_assignment_id;

  return db
    .updateTable('syllabus_weeks')
    .set(updatePayload)
    .where('id', '=', weekId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteSyllabusWeek(weekId: string, user: AuthUser) {
  const week = await db
    .selectFrom('syllabus_weeks')
    .select(['id', 'class_id'])
    .where('id', '=', weekId)
    .executeTakeFirst();

  if (!week) {
    throw new NotFoundError('Syllabus week not found');
  }

  await verifyClassAccess(week.class_id, user);

  await db.deleteFrom('syllabus_weeks').where('id', '=', weekId).execute();
}

export async function updateClassSyllabusOverview(classId: string, overview: string | null, user: AuthUser) {
  await verifyClassAccess(classId, user);

  return db
    .updateTable('classes')
    .set({ syllabus_overview: overview })
    .where('id', '=', classId)
    .returningAll()
    .executeTakeFirstOrThrow();
}
