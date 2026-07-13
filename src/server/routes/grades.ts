import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getSubmissionById,
  gradeSubmission,
  getSubmissionGrade,
  getClassGrades,
  getStudentGrades,
} from '../controllers/submissionController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const gradeSchema = z.object({
  rubric_scores: z
    .array(
      z.object({
        criterion: z.string().min(1),
        score: z.number().nonnegative(),
      })
    )
    .min(1),
  feedback: z.string().optional().nullable(),
});

export async function gradeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // GET details of specific submission
  app.get('/submissions/:submission_id', async (request, reply) => {
    const user = request.user!;

    const { submission_id } = z.object({ submission_id: z.string().uuid() }).parse(request.params);
    const result = await getSubmissionById(submission_id, user);
    reply.send(result);
  });

  // POST grade for submission
  app.post('/submissions/:submission_id/grades', { preHandler: requireRole('teacher', 'admin') }, async (request, reply) => {
    const user = request.user!;

    const { submission_id } = z.object({ submission_id: z.string().uuid() }).parse(request.params);
    const body = gradeSchema.parse(request.body);
    const result = await gradeSubmission(submission_id, body, user);
    reply.status(201).send(result);
  });

  // GET grade of specific submission
  app.get('/submissions/:submission_id/grades', async (request, reply) => {
    const user = request.user!;

    const { submission_id } = z.object({ submission_id: z.string().uuid() }).parse(request.params);
    const result = await getSubmissionGrade(submission_id, user);
    reply.send(result);
  });

  // GET class grades (role-specific: student gets own, teacher gets all)
  app.get('/classes/:class_id/grades', async (request, reply) => {
    const user = request.user!;

    const { class_id } = z.object({ class_id: z.string().uuid() }).parse(request.params);
    const result = await getClassGrades(class_id, user);
    reply.send(result);
  });

  // GET all grades for a student, across classes
  app.get('/grades', async (request, reply) => {
    const user = request.user!;

    const { student_id } = z.object({ student_id: z.string().uuid() }).parse(request.query);
    const result = await getStudentGrades(student_id, user);
    reply.send(result);
  });
}
