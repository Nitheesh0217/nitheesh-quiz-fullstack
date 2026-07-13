import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';

import {
  getAverageGrades,
  getAverageGradeForClass,
  getTeacherNames,
  getStudentNames,
  getAllClasses,
  getClassStudentsList,
} from '../controllers/statsController';

// School Statistics API — GET /api/v0/stats/*
// Exposes school-wide metrics for external integration. All routes are
// authenticated; any signed-in user (admin, teacher, or student) may read them.
export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/average-grades', async (_request, reply) => {
    const result = await getAverageGrades();
    reply.send(result);
  });

  app.get('/average-grades/:class_id', async (request, reply) => {
    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getAverageGradeForClass(class_id);
    reply.send(result);
  });

  app.get('/teacher-names', async (_request, reply) => {
    const result = await getTeacherNames();
    reply.send(result);
  });

  app.get('/student-names', async (_request, reply) => {
    const result = await getStudentNames();
    reply.send(result);
  });

  app.get('/classes', async (_request, reply) => {
    const result = await getAllClasses();
    reply.send(result);
  });

  app.get('/classes/:class_id', async (request, reply) => {
    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getClassStudentsList(class_id);
    reply.send(result);
  });
}
