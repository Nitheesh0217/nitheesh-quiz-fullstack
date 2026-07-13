import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '../db/types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export function requireRole(...roles: UserRole[]) {
  return async function requireRoleHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
    }
  };
}

export function requireSelfOrRole(
  getResourceUserId: (request: FastifyRequest) => string,
  ...roles: UserRole[]
) {
  return async function requireSelfOrRoleHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const isSelf = request.user.id === getResourceUserId(request);
    const hasRole = roles.includes(request.user.role);

    if (!isSelf && !hasRole) {
      throw new ForbiddenError();
    }
  };
}
