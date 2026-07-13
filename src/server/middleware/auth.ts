import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  let token = request.cookies[ACCESS_TOKEN_COOKIE];

  // Accept Authorization: Bearer <token> for external API integration compatibility
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    throw new UnauthorizedError('Missing access token');
  }

  try {
    const payload = verifyAccessToken(token);
    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      school_id: payload.school_id,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}
