import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateSyllabusWeek, deleteSyllabusWeek } from '../controllers/syllabusController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const updateSyllabusWeekSchema = z.object({
  week_number: z.number().int().positive().optional(),
  title: z.string().min(1).optional(),
  topics: z.string().optional().nullable(),
  readings: z.string().optional().nullable(),
  video_links: z.array(z.string().min(1)).optional(),
  linked_assignment_id: z.string().uuid().optional().nullable(),
});

export async function syllabusWeekRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.put('/:week_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { week_id } = z.object({ week_id: z.string().uuid() }).parse(request.params);
    const body = updateSyllabusWeekSchema.parse(request.body);
    const result = await updateSyllabusWeek(week_id, body, user);
    reply.send(result);
  });

  app.delete('/:week_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { week_id } = z.object({ week_id: z.string().uuid() }).parse(request.params);
    await deleteSyllabusWeek(week_id, user);
    reply.status(204).send();
  });
}
