import { db } from '../db';
import { NotFoundError } from '../utils/errors';
import { verifyClassAccess } from '../utils/classAccess';
import type { AuthUser } from '../types';

export interface CreateAnnouncementInput {
  title: string;
  content: string;
}

export interface UpdateAnnouncementInput {
  title?: string;
  content?: string;
}

export async function getAnnouncements(classId: string, user: AuthUser) {
  await verifyClassAccess(classId, user);

  return db
    .selectFrom('class_announcements')
    .innerJoin('users', 'users.id', 'class_announcements.author_id')
    .select([
      'class_announcements.id',
      'class_announcements.class_id',
      'class_announcements.title',
      'class_announcements.content',
      'class_announcements.created_at',
      'class_announcements.updated_at',
      'users.name as author_name',
    ])
    .where('class_announcements.class_id', '=', classId)
    .orderBy('class_announcements.created_at', 'desc')
    .execute();
}

export async function createAnnouncement(classId: string, input: CreateAnnouncementInput, user: AuthUser) {
  await verifyClassAccess(classId, user);

  return db
    .insertInto('class_announcements')
    .values({
      class_id: classId,
      author_id: user.id,
      title: input.title,
      content: input.content,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function getOwnedAnnouncement(announcementId: string, user: AuthUser) {
  const announcement = await db
    .selectFrom('class_announcements')
    .selectAll()
    .where('id', '=', announcementId)
    .executeTakeFirst();

  if (!announcement) {
    throw new NotFoundError('Announcement not found');
  }

  await verifyClassAccess(announcement.class_id, user);

  return announcement;
}

export async function updateAnnouncement(announcementId: string, input: UpdateAnnouncementInput, user: AuthUser) {
  await getOwnedAnnouncement(announcementId, user);

  return db
    .updateTable('class_announcements')
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', announcementId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteAnnouncement(announcementId: string, user: AuthUser) {
  await getOwnedAnnouncement(announcementId, user);

  await db.deleteFrom('class_announcements').where('id', '=', announcementId).execute();
}
