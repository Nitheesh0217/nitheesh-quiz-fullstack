import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { requireRole, requireSelfOrRole } from './rbac';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

describe('rbac middleware', () => {
  const mockReply = {} as FastifyReply;

  describe('requireRole', () => {
    it('should allow request when user has one of the required roles', async () => {
      const mockRequest = {
        user: { id: '1', email: 't@s.edu', role: 'teacher', school_id: null },
      } as unknown as FastifyRequest;

      const handler = requireRole('teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).resolves.not.toThrow();
    });

    it('should throw UnauthorizedError when user is not present on request context', async () => {
      const mockRequest = {} as FastifyRequest;
      const handler = requireRole('student');
      await expect(handler(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user role does not match required roles', async () => {
      const mockRequest = {
        user: { id: '1', email: 's@s.edu', role: 'student', school_id: null },
      } as unknown as FastifyRequest;

      const handler = requireRole('teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('requireSelfOrRole', () => {
    const getTargetUserId = (req: FastifyRequest) => (req.params as { userId: string }).userId;

    it('should allow request when target user matches authenticated user (self)', async () => {
      const mockRequest = {
        user: { id: 'student-123', email: 's@s.edu', role: 'student', school_id: null },
        params: { userId: 'student-123' },
      } as unknown as FastifyRequest;

      const handler = requireSelfOrRole(getTargetUserId, 'teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).resolves.not.toThrow();
    });

    it('should allow request when user has one of the bypass roles even if not self', async () => {
      const mockRequest = {
        user: { id: 'teacher-456', email: 't@s.edu', role: 'teacher', school_id: null },
        params: { userId: 'student-123' },
      } as unknown as FastifyRequest;

      const handler = requireSelfOrRole(getTargetUserId, 'teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).resolves.not.toThrow();
    });

    it('should throw ForbiddenError when user is neither self nor has matching role', async () => {
      const mockRequest = {
        user: { id: 'student-456', email: 's2@s.edu', role: 'student', school_id: null },
        params: { userId: 'student-123' },
      } as unknown as FastifyRequest;

      const handler = requireSelfOrRole(getTargetUserId, 'teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when user is not present on request context', async () => {
      const mockRequest = {
        params: { userId: 'student-123' },
      } as unknown as FastifyRequest;

      const handler = requireSelfOrRole(getTargetUserId, 'teacher', 'admin');
      await expect(handler(mockRequest, mockReply)).rejects.toThrow(UnauthorizedError);
    });
  });
});
