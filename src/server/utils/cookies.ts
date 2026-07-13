import type { FastifyReply } from 'fastify';
import { env } from '../env';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  const secure = env.NODE_ENV === 'production';

  // 'lax', not 'strict': the Google OAuth callback sets these cookies on a
  // response that's itself part of a top-level navigation chain originating
  // from accounts.google.com, immediately followed by a redirect back to the
  // frontend origin. 'strict' cookies are unreliable on that landing
  // request - the browser can drop them - which silently breaks the OAuth
  // flow (session never sticks) while password login/register, which never
  // involves an external redirect, would keep working fine either way.
  reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });

  reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}
