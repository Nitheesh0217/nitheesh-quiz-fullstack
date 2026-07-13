import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateAnnouncement, deleteAnnouncement } from '../controllers/announcementController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
});

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.put('/:announcement_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { announcement_id } = z.object({ announcement_id: z.string().uuid() }).parse(request.params);
    const body = updateAnnouncementSchema.parse(request.body);
    const result = await updateAnnouncement(announcement_id, body, user);
    reply.send(result);
  });

  app.delete('/:announcement_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { announcement_id } = z.object({ announcement_id: z.string().uuid() }).parse(request.params);
    await deleteAnnouncement(announcement_id, user);
    reply.status(204).send();
  });
}
