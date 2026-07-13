import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAssignmentById, updateAssignment, deleteAssignment } from '../controllers/assignmentController';
import { submitAssignment, getSubmissions } from '../controllers/submissionController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  rubric: z
    .array(
      z.object({
        criterion: z.string().min(1),
        max_points: z.number().positive(),
      })
    )
    .min(1)
    .optional(),
});

const submitSchema = z.object({
  file_url: z.string().optional().nullable(),
  text_content: z.string().optional().nullable(),
});

export async function assignmentRoutes(app: FastifyInstance): Promise<void> {
  // Apply authentication to all assignment routes
  app.addHook('preHandler', authenticate);

  app.get('/:assignment_id', async (request, reply) => {
    const user = request.user!;

    const { assignment_id } = z.object({ assignment_id: z.string().uuid() }).parse(request.params);
    const result = await getAssignmentById(assignment_id, user);
    reply.send(result);
  });

  app.put('/:assignment_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { assignment_id } = z.object({ assignment_id: z.string().uuid() }).parse(request.params);
    const body = updateAssignmentSchema.parse(request.body);
    const result = await updateAssignment(assignment_id, body, user);
    reply.send(result);
  });

  // Submission Sub-routes
  app.post('/:assignment_id/submit', { preHandler: requireRole('student') }, async (request, reply) => {
    const user = request.user!;

    const { assignment_id } = z.object({ assignment_id: z.string().uuid() }).parse(request.params);
    const body = submitSchema.parse(request.body);
    const result = await submitAssignment(assignment_id, body, user);
    reply.status(201).send(result);
  });

  app.get('/:assignment_id/submissions', async (request, reply) => {
    const user = request.user!;

    const { assignment_id } = z.object({ assignment_id: z.string().uuid() }).parse(request.params);
    const result = await getSubmissions(assignment_id, user);
    reply.send(result);
  });

  app.delete('/:assignment_id', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;
    const { assignment_id } = z.object({ assignment_id: z.string().uuid() }).parse(request.params);
    await deleteAssignment(assignment_id, user);
    reply.status(204).send();
  });
}
