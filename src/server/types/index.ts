import type { UserRole } from '../db/types';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  school_id: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
