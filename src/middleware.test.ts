import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { signAccessToken, type JwtPayload } from './server/utils/jwt';

describe('middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-chars-long';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-at-least-32-chars-long';
  });

  function tokenFor(overrides: Partial<JwtPayload> = {}): string {
    return signAccessToken({
      sub: 'user-uuid-1234',
      email: 'test@school.edu',
      role: 'student',
      school_id: 'school-uuid-5678',
      token_version: 0,
      onboarding_completed: true,
      ...overrides,
    });
  }

  function requestFor(path: string, token?: string): NextRequest {
    const headers = new Headers();
    if (token) {
      headers.set('cookie', `access_token=${token}`);
    }
    return new NextRequest(`http://localhost:3000${path}`, { headers });
  }

  describe('/dashboard/*', () => {
    it('redirects to /login when there is no access token', () => {
      const res = middleware(requestFor('/dashboard'));
      expect(res.headers.get('location')).toContain('/login');
    });

    it('redirects to /login when the cookie is not a valid JWT', () => {
      const res = middleware(requestFor('/dashboard', 'not-a-real-jwt'));
      expect(res.headers.get('location')).toContain('/login');
    });

    it('redirects an incomplete-onboarding user to /complete-profile before any role guard runs', () => {
      const token = tokenFor({ onboarding_completed: false, role: 'teacher' });
      const res = middleware(requestFor('/dashboard/teacher', token));
      expect(res.headers.get('location')).toContain('/complete-profile');
    });

    it('lets a completed student through to /dashboard/student', () => {
      const token = tokenFor({ role: 'student' });
      const res = middleware(requestFor('/dashboard/student', token));
      expect(res.headers.get('location')).toBeNull();
    });

    it('redirects a student away from /dashboard/teacher back to /dashboard', () => {
      const token = tokenFor({ role: 'student' });
      const res = middleware(requestFor('/dashboard/teacher', token));
      const location = res.headers.get('location');
      expect(location).toContain('/dashboard');
      expect(location).not.toContain('/complete-profile');
    });
  });

  describe('/complete-profile', () => {
    it('redirects to /login when there is no access token', () => {
      const res = middleware(requestFor('/complete-profile'));
      expect(res.headers.get('location')).toContain('/login');
    });

    it('redirects an already-completed user away to /dashboard', () => {
      const token = tokenFor({ onboarding_completed: true });
      const res = middleware(requestFor('/complete-profile', token));
      expect(res.headers.get('location')).toContain('/dashboard');
    });

    it('lets a still-pending user through to fill in the form', () => {
      const token = tokenFor({ onboarding_completed: false });
      const res = middleware(requestFor('/complete-profile', token));
      expect(res.headers.get('location')).toBeNull();
    });
  });
});
