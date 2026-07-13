import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  enrollStudentInClass,
  getClassStudents,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
} from '../controllers/classController';
import { getAssignments, createAssignment } from '../controllers/assignmentController';
import {
  getSyllabusWeeks,
  createSyllabusWeek,
  updateClassSyllabusOverview,
} from '../controllers/syllabusController';
import { getAnnouncements, createAnnouncement } from '../controllers/announcementController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { db } from '../db';
import { ValidationError } from '../utils/errors';

const createClassSchema = z.object({
  school_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  code: z.string().optional(),
  // Only meaningful (and required) when an admin is creating the class -
  // teachers always become the teacher of their own created class.
  teacher_id: z.string().uuid().optional(),
});

const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const enrollSchema = z.object({
  enrollment_code: z.string().min(1),
});

const addStudentSchema = z.object({
  student_id: z.string().uuid(),
});

const createAssignmentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  rubric: z.array(
    z.object({
      criterion: z.string().min(1),
      max_points: z.number().positive(),
    })
  ).min(1),
});

const createSyllabusWeekSchema = z.object({
  week_number: z.number().int().positive(),
  title: z.string().min(1),
  topics: z.string().optional().nullable(),
  readings: z.string().optional().nullable(),
  video_links: z.array(z.string().min(1)).optional().default([]),
  linked_assignment_id: z.string().uuid().optional().nullable(),
});

const syllabusOverviewSchema = z.object({
  syllabus_overview: z.string().max(5000).nullable(),
});

const createAnnouncementSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

export async function classRoutes(app: FastifyInstance): Promise<void> {
  // Apply authentication to all class routes
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const user = request.user!;

    const classes = await getClasses(user);
    reply.send(classes);
  });

  app.post('/', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const body = createClassSchema.parse(request.body);

    // Admins don't teach classes themselves - they must name a real teacher
    // to own the class. Teachers always become the teacher of their own
    // created class, regardless of what (if anything) they send.
    let teacherId = user.id;
    let schoolId = body.school_id;
    if (user.role === 'admin') {
      if (!body.teacher_id) {
        throw new ValidationError('teacher_id is required when creating a class as an admin');
      }
      const teacherUser = await db
        .selectFrom('users')
        .select(['id', 'role'])
        .where('id', '=', body.teacher_id)
        .executeTakeFirst();
      if (!teacherUser || teacherUser.role !== 'teacher') {
        throw new ValidationError('teacher_id must reference an existing teacher');
      }
      teacherId = body.teacher_id;
    } else {
      // A teacher's own school_id is authoritative - never trust a
      // client-supplied value here, or a teacher could scope their class to
      // an arbitrary (or nonexistent) school.
      if (!user.school_id) {
        throw new ValidationError('Your account has no school assigned yet');
      }
      schoolId = user.school_id;
    }

    const result = await createClass({ ...body, school_id: schoolId }, teacherId);
    reply.status(201).send(result);
  });

  app.get('/available', { preHandler: requireRole('student') }, async (request, reply) => {
    const user = request.user!;
    if (!user.school_id) {
      reply.send([]);
      return;
    }
    const { getAvailableClassesForStudent } = await import('../controllers/classController');
    const result = await getAvailableClassesForStudent(user.id, user.school_id);
    reply.send(result);
  });

  app.get('/:class_id', async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getClassById(class_id, user);
    reply.send(result);
  });

  app.post('/:class_id/enroll', { preHandler: requireRole('student') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const { enrollment_code } = enrollSchema.parse(request.body);

    const result = await enrollStudentInClass(class_id, enrollment_code, user.id);
    reply.send({ success: true, enrollment: result });
  });

  app.get('/:class_id/students', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getClassStudents(class_id, user);
    reply.send(result);
  });

  app.post('/:class_id/students', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const { student_id } = addStudentSchema.parse(request.body);
    const result = await addStudentToClass(class_id, student_id, user);
    reply.status(201).send(result);
  });

  // Class-specific Assignment Endpoints
  app.get('/:class_id/assignments', async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getAssignments(class_id, user);
    reply.send(result);
  });

  app.post('/:class_id/assignments', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const body = createAssignmentSchema.parse(request.body);
    const result = await createAssignment(class_id, body, user);
    reply.status(201).send(result);
  });

  // Syllabus & Announcements
  app.get('/:class_id/syllabus-weeks', async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getSyllabusWeeks(class_id, user);
    reply.send(result);
  });

  app.post('/:class_id/syllabus-weeks', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const body = createSyllabusWeekSchema.parse(request.body);
    const result = await createSyllabusWeek(class_id, body, user);
    reply.status(201).send(result);
  });

  app.put('/:class_id/syllabus-overview', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const { syllabus_overview } = syllabusOverviewSchema.parse(request.body);
    const result = await updateClassSyllabusOverview(class_id, syllabus_overview, user);
    reply.send(result);
  });

  app.get('/:class_id/announcements', async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getAnnouncements(class_id, user);
    reply.send(result);
  });

  app.post('/:class_id/announcements', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const body = createAnnouncementSchema.parse(request.body);
    const result = await createAnnouncement(class_id, body, user);
    reply.status(201).send(result);
  });

  app.put('/:class_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;
    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const body = updateClassSchema.parse(request.body);
    const result = await updateClass(class_id, body, user);
    reply.send(result);
  });

  app.delete('/:class_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;
    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    await deleteClass(class_id, user);
    reply.status(204).send();
  });

  app.delete('/:class_id/students/:student_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;
    const { class_id, student_id } = z.object({
      class_id: z.string().uuid(),
      student_id: z.string().uuid(),
    }).parse(request.params);
    await removeStudentFromClass(class_id, student_id, user);
    reply.status(204).send();
  });
}
