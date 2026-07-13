import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../env';
import type { UserRole } from '../db/types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  school_id: string | null;
  // Bumped on password reset so previously issued refresh tokens are
  // rejected in refreshAccessToken even though they haven't expired yet.
  token_version: number;
  // False for a bare Google OAuth signup until POST /api/auth/complete-profile
  // runs — lets middleware.ts gate /dashboard/* without a DB round-trip.
  onboarding_completed: boolean;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
