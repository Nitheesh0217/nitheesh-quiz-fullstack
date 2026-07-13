import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { z } from 'zod';
import { registerUser } from '../controllers/authController';
import { ConflictError } from '../utils/errors';

const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['admin', 'teacher', 'student']),
  school_id: z.string().uuid().optional().nullable(),
});

const createSchoolSchema = z.object({
  name: z.string().min(1),
});

const roleQuerySchema = z.enum(['admin', 'teacher', 'student']).optional();

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth and requireRole to all routes
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('admin'));

  // GET /api/admin/users (list users, filter by role)
  app.get('/users', async (request, reply) => {
    const { role: roleRaw } = request.query as { role?: string };
    const role = roleQuerySchema.parse(roleRaw);
    let query = db.selectFrom('users').select(['id', 'name', 'email', 'role', 'school_id', 'is_suspended']);

    if (role) {
      query = query.where('role', '=', role);
    }

    const list = await query.execute();
    reply.send(list);
  });

  // POST /api/admin/users (admin creating a user)
  app.post('/users', async (request, reply) => {
    const body = adminCreateUserSchema.parse(request.body);
    const result = await registerUser({
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role,
      school_id: body.school_id,
    });

    reply.status(201).send({
      id: result.userId,
      email: result.email,
      name: result.name,
      role: result.role,
      school_id: result.school_id,
    });
  });

  // DELETE /api/admin/users/:user_id (admin deleting a user)
  app.delete('/users/:user_id', async (request, reply) => {
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(request.params);
    const currentUser = request.user!;

    if (user_id === currentUser.id) {
      throw new ConflictError('You cannot delete your own admin account');
    }

    // Verify user exists
    const user = await db
      .selectFrom('users')
      .select(['id', 'role'])
      .where('id', '=', user_id)
      .executeTakeFirst();

    if (!user) {
      reply.status(404).send({ error: 'User not found' });
      return;
    }

    if (user.role === 'teacher') {
      const [ownedClass, gradedSubmission] = await Promise.all([
        db.selectFrom('classes').select('id').where('teacher_id', '=', user_id).executeTakeFirst(),
        db.selectFrom('grades').select('id').where('graded_by', '=', user_id).executeTakeFirst(),
      ]);

      if (ownedClass) {
        throw new ConflictError('Cannot delete a teacher who still owns classes. Reassign or delete their classes first.');
      }

      if (gradedSubmission) {
        throw new ConflictError('Cannot delete a teacher who has graded submissions. Their grading history must be reassigned first.');
      }
    }

    await db.deleteFrom('users').where('id', '=', user_id).execute();
    reply.status(204).send();
  });

  // PATCH /api/admin/users/:user_id/suspend
  app.patch('/users/:user_id/suspend', async (request, reply) => {
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(request.params);
    const { is_suspended } = z.object({ is_suspended: z.boolean() }).parse(request.body);

    const result = await db
      .updateTable('users')
      .set({ is_suspended })
      .where('id', '=', user_id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      reply.status(404).send({ error: 'User not found' });
      return;
    }

    reply.send(result);
  });

  // POST /api/admin/schools (create a school)
  app.post('/schools', async (request, reply) => {
    const body = createSchoolSchema.parse(request.body);
    const result = await db
      .insertInto('schools')
      .values({ name: body.name })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    reply.status(201).send(result);
  });

  // GET /api/admin/schools (list schools)
  app.get('/schools', async (_request, reply) => {
    const list = await db.selectFrom('schools').selectAll().execute();
    reply.send(list);
  });

  // GET /api/admin/stats/average-grades (calculate average grade across system)
  app.get('/stats/average-grades', async (_request, reply) => {
    const result = await db
      .selectFrom('grades')
      .select((eb) => eb.fn.avg('total_score').as('avg'))
      .executeTakeFirst();

    const average = result?.avg ? `${Number(result.avg).toFixed(1)}%` : null;
    reply.send({ average });
  });

  // Teacher Groups CRUD Endpoints
  
  // GET /api/admin/teacher-groups
  app.get('/teacher-groups', async (request, reply) => {
    const { school_id } = request.query as { school_id?: string };
    let query = db.selectFrom('teacher_groups').selectAll();
    if (school_id) {
      const parsedSchoolId = z.string().uuid().parse(school_id);
      query = query.where('school_id', '=', parsedSchoolId);
    }
    const list = await query.execute();
    reply.send(list);
  });

  // POST /api/admin/teacher-groups
  app.post('/teacher-groups', async (request, reply) => {
    const body = z.object({
      school_id: z.string().uuid(),
      name: z.string().min(1),
    }).parse(request.body);

    const result = await db
      .insertInto('teacher_groups')
      .values({
        school_id: body.school_id,
        name: body.name,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    reply.status(201).send(result);
  });

  // GET /api/admin/teacher-groups/:group_id
  app.get('/teacher-groups/:group_id', async (request, reply) => {
    const { group_id } = z.object({ group_id: z.string().uuid() }).parse(request.params);
    const group = await db
      .selectFrom('teacher_groups')
      .selectAll()
      .where('id', '=', group_id)
      .executeTakeFirst();

    if (!group) {
      reply.status(404).send({ error: 'Teacher group not found' });
      return;
    }

    const members = await db
      .selectFrom('teacher_group_members')
      .innerJoin('users', 'users.id', 'teacher_group_members.teacher_id')
      .select(['users.id', 'users.name', 'users.email'])
      .where('teacher_group_members.group_id', '=', group_id)
      .execute();

    reply.send({ ...group, members });
  });

  // PUT /api/admin/teacher-groups/:group_id
  app.put('/teacher-groups/:group_id', async (request, reply) => {
    const { group_id } = z.object({ group_id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().min(1) }).parse(request.body);

    const result = await db
      .updateTable('teacher_groups')
      .set({ name: body.name })
      .where('id', '=', group_id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      reply.status(404).send({ error: 'Teacher group not found' });
      return;
    }

    reply.send(result);
  });

  // DELETE /api/admin/teacher-groups/:group_id
  app.delete('/teacher-groups/:group_id', async (request, reply) => {
    const { group_id } = z.object({ group_id: z.string().uuid() }).parse(request.params);

    const result = await db
      .deleteFrom('teacher_groups')
      .where('id', '=', group_id)
      .returning('id')
      .executeTakeFirst();

    if (!result) {
      reply.status(404).send({ error: 'Teacher group not found' });
      return;
    }

    reply.status(204).send();
  });

  // POST /api/admin/teacher-groups/:group_id/members
  app.post('/teacher-groups/:group_id/members', async (request, reply) => {
    const { group_id } = z.object({ group_id: z.string().uuid() }).parse(request.params);
    const { teacher_id } = z.object({ teacher_id: z.string().uuid() }).parse(request.body);

    // Verify teacher exists and has teacher role
    const teacher = await db
      .selectFrom('users')
      .select(['id', 'role'])
      .where('id', '=', teacher_id)
      .executeTakeFirst();

    if (!teacher || teacher.role !== 'teacher') {
      reply.status(400).send({ error: 'User must be a teacher' });
      return;
    }

    const result = await db
      .insertInto('teacher_group_members')
      .values({
        group_id,
        teacher_id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    reply.status(201).send(result);
  });

  // DELETE /api/admin/teacher-groups/:group_id/members/:teacher_id
  app.delete('/teacher-groups/:group_id/members/:teacher_id', async (request, reply) => {
    const { group_id, teacher_id } = z.object({
      group_id: z.string().uuid(),
      teacher_id: z.string().uuid(),
    }).parse(request.params);

    const result = await db
      .deleteFrom('teacher_group_members')
      .where('group_id', '=', group_id)
      .where('teacher_id', '=', teacher_id)
      .returning('id')
      .executeTakeFirst();

    if (!result) {
      reply.status(404).send({ error: 'Membership not found' });
      return;
    }

    reply.status(204).send();
  });
}
