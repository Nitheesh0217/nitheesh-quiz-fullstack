import { describe, it, expect, beforeEach } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, type JwtPayload } from './jwt';

describe('jwt utility', () => {
  const mockPayload: JwtPayload = {
    sub: 'user-uuid-1234',
    email: 'test@school.edu',
    role: 'student',
    school_id: 'school-uuid-5678',
    token_version: 0,
    onboarding_completed: true,
  };

  beforeEach(() => {
    // Ensure secrets are set (vitest loadEnv should handle this)
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars-long';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-at-least-32-chars-long';
  });

  it('should sign and verify an access token', () => {
    const token = signAccessToken(mockPayload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(mockPayload.sub);
    expect(decoded.email).toBe(mockPayload.email);
    expect(decoded.role).toBe(mockPayload.role);
    expect(decoded.school_id).toBe(mockPayload.school_id);
    expect(decoded.token_version).toBe(mockPayload.token_version);
  });

  it('should sign and verify a refresh token', () => {
    const token = signRefreshToken(mockPayload);
    expect(token).toBeDefined();

    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(mockPayload.sub);
    expect(decoded.email).toBe(mockPayload.email);
    expect(decoded.role).toBe(mockPayload.role);
    expect(decoded.school_id).toBe(mockPayload.school_id);
    expect(decoded.token_version).toBe(mockPayload.token_version);
  });

  it('should throw an error for malformed or expired access tokens', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow();
  });

  it('should throw an error for malformed or expired refresh tokens', () => {
    expect(() => verifyRefreshToken('invalid-token')).toThrow();
  });
});
