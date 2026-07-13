import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from './auth';
import { signAccessToken, type JwtPayload } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { ACCESS_TOKEN_COOKIE } from '../utils/cookies';

describe('authenticate middleware', () => {
  const mockPayload: JwtPayload = {
    sub: 'user-uuid-1234',
    email: 'test@school.edu',
    role: 'student',
    school_id: 'school-uuid-5678',
    token_version: 0,
    onboarding_completed: true,
  };

  it('should successfully authenticate with a valid access token cookie', async () => {
    const token = signAccessToken(mockPayload);
    const mockRequest = {
      cookies: {
        [ACCESS_TOKEN_COOKIE]: token,
      },
    } as unknown as FastifyRequest;

    const mockReply = {} as FastifyReply;

    await expect(authenticate(mockRequest, mockReply)).resolves.not.toThrow();
    expect(mockRequest.user).toBeDefined();
    expect(mockRequest.user?.id).toBe(mockPayload.sub);
    expect(mockRequest.user?.email).toBe(mockPayload.email);
    expect(mockRequest.user?.role).toBe(mockPayload.role);
    expect(mockRequest.user?.school_id).toBe(mockPayload.school_id);
  });

  it('should throw UnauthorizedError when access token cookie is missing', async () => {
    const mockRequest = {
      cookies: {},
    } as unknown as FastifyRequest;

    const mockReply = {} as FastifyReply;

    await expect(authenticate(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
  });

  it('should throw UnauthorizedError with invalid access token cookie', async () => {
    const mockRequest = {
      cookies: {
        [ACCESS_TOKEN_COOKIE]: 'invalid-jwt-token',
      },
    } as unknown as FastifyRequest;

    const mockReply = {} as FastifyReply;

    await expect(authenticate(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
  });
});
