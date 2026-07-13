import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { classRoutes } from './classes';
import { assignmentRoutes } from './assignments';
import { syllabusWeekRoutes } from './syllabusWeeks';
import { announcementRoutes } from './announcements';
import { gradeRoutes } from './grades';
import { adminRoutes } from './admin';
import { statsRoutes } from './stats';
import { chatRoutes } from './chat';

export function registerRoutes(app: FastifyInstance): void {
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(classRoutes, { prefix: '/api/classes' });
  app.register(assignmentRoutes, { prefix: '/api/assignments' });
  app.register(syllabusWeekRoutes, { prefix: '/api/syllabus-weeks' });
  app.register(announcementRoutes, { prefix: '/api/announcements' });
  app.register(gradeRoutes, { prefix: '/api' });
  app.register(adminRoutes, { prefix: '/api/admin' });
  app.register(statsRoutes, { prefix: '/api/v0/stats' });
  app.register(chatRoutes, { prefix: '/api' });
}
