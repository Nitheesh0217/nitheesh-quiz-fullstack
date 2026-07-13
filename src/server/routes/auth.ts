import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  registerUser,
  loginUser,
  getUserById,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
} from '../controllers/authController';
import {
  isGoogleOAuthConfigured,
  buildGoogleAuthUrl,
  handleGoogleCallback,
} from '../controllers/oauthController';
import { authenticate } from '../middleware/auth';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from '../middleware/rateLimiter';
import { env } from '../env';
import { db } from '../db';
import { ConflictError, ServiceUnavailableError, UnauthorizedError, ValidationError } from '../utils/errors';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, setAuthCookies } from '../utils/cookies';
import { signAccessToken, signRefreshToken, type JwtPayload } from '../utils/jwt';

const OAUTH_STATE_COOKIE = 'oauth_state';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['student', 'teacher']),
  school_id: z.string().uuid().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8),
});

const completeProfileSchema = z.object({
  role: z.enum(['student', 'teacher']),
  school_id: z.string().uuid(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/schools', async (_request, reply) => {
    const { db } = await import('../db');
    let list = await db.selectFrom('schools').selectAll().execute();
    if (list.length === 0) {
      const defaultSchool = await db
        .insertInto('schools')
        .values({ name: 'Concentrate Academy' })
        .returningAll()
        .executeTakeFirst();
      if (defaultSchool) {
        list = [defaultSchool];
      }
    }
    reply.send(list);
  });

  app.post('/register', { preHandler: registerLimiter }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await registerUser(body);

    setAuthCookies(reply, result.accessToken, result.refreshToken);
    reply.status(201).send({
      user_id: result.userId,
      email: result.email,
      name: result.name,
      role: result.role,
      school_id: result.school_id,
      token: result.accessToken,
    });
  });

  app.post('/login', { preHandler: loginLimiter }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await loginUser(body.email, body.password);

    setAuthCookies(reply, result.accessToken, result.refreshToken);
    reply.send({
      token: result.accessToken,
      user_id: result.userId,
      email: result.email,
      name: result.name,
      role: result.role,
      school_id: result.school_id,
    });
  });

  app.post('/forgot-password', { preHandler: forgotPasswordLimiter }, async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    const result = await forgotPassword(body.email);
    reply.send(result);
  });

  // No rate limiter here - the reset token itself is the throttle (32 random
  // bytes, single-use, 30 min expiry), unlike /login and /forgot-password
  // which are throttled because they're guessable (email/password guesses).
  app.post('/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const result = await resetPassword(body.token, body.new_password);
    reply.send(result);
  });

  app.post('/logout', async (_request, reply) => {
    const secure = env.NODE_ENV === 'production';
    reply.clearCookie(ACCESS_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: 'lax',
    });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: 'lax',
    });
    reply.send({ success: true });
  });

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const authUser = request.user!;

    const user = await getUserById(authUser.id);
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    reply.send(user);
  });

  // Resolves a bare Google-OAuth signup (role: 'student' placeholder,
  // school_id: null, onboarding_completed: false) into a real account.
  // Any authenticated user can call this - not role-gated, since a pending
  // user has no real role yet. Re-signs both tokens since the JWT's role/
  // school_id/onboarding_completed claims are now stale.
  //
  // The `where('onboarding_completed', '=', false)` guard is load-bearing,
  // not just a filter: without it, an already-onboarded user (e.g. an
  // existing student) could call this endpoint to self-promote to teacher
  // or jump to an arbitrary school, since nothing else here checks the
  // caller's *current* role before accepting their *requested* one.
  app.post('/complete-profile', { preHandler: authenticate }, async (request, reply) => {
    const body = completeProfileSchema.parse(request.body);
    const authUser = request.user!;

    const validSchool = await db
      .selectFrom('schools')
      .select('id')
      .where('id', '=', body.school_id)
      .executeTakeFirst();
    if (!validSchool) {
      throw new ValidationError('Selected school does not exist');
    }

    const user = await db
      .updateTable('users')
      .set({ role: body.role, school_id: body.school_id, onboarding_completed: true })
      .where('id', '=', authUser.id)
      .where('onboarding_completed', '=', false)
      .returning(['id', 'email', 'name', 'role', 'school_id', 'token_version', 'onboarding_completed'])
      .executeTakeFirst();

    if (!user) {
      throw new ConflictError('Profile has already been completed');
    }

    const tokenPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      school_id: user.school_id,
      token_version: user.token_version,
      onboarding_completed: user.onboarding_completed,
    };

    const accessToken = signAccessToken(tokenPayload);
    setAuthCookies(reply, accessToken, signRefreshToken(tokenPayload));
    reply.send({
      token: accessToken,
      user_id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      school_id: user.school_id,
    });
  });

  // Google OAuth — GET /api/auth/google redirects to Google's consent
  // screen; Google then redirects back to /api/auth/google/callback.
  app.get('/google', async (request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      throw new ServiceUnavailableError(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it.'
      );
    }

    const { intent } = request.query as { intent?: string };

    // "register" intent (from the sign-up page) is allowed to create a new
    // (bare, incomplete) account; "login" intent (from the sign-in page)
    // only ever signs an existing user in - see handleGoogleCallback's
    // NO_ACCOUNT_FOUND branch. Role/school are no longer collected here -
    // a new account is completed afterwards via /complete-profile.
    const isRegisterIntent = intent === 'register';

    const randVal = randomBytes(16).toString('hex');
    const state = `${randVal}:${isRegisterIntent ? 'register' : 'login'}`;

    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    reply.redirect(buildGoogleAuthUrl(state));
  });

  app.get('/google/callback', async (request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      throw new ServiceUnavailableError('Google OAuth is not configured.');
    }

    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const expectedState = request.cookies[OAUTH_STATE_COOKIE];
    const isRegister = (state || expectedState || '').split(':')[1] === 'register';
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    const errorRedirectBase = isRegister
      ? `${env.FRONTEND_URL}/register?oauth_error=`
      : `${env.FRONTEND_URL}/login?oauth_error=`;

    if (error) {
      reply.redirect(`${errorRedirectBase}${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      reply.redirect(`${errorRedirectBase}invalid_state`);
      return;
    }

    try {
      const result = await handleGoogleCallback(code, state);
      setAuthCookies(reply, result.accessToken, result.refreshToken);
      reply.redirect(
        result.onboarding_completed ? `${env.FRONTEND_URL}/dashboard` : `${env.FRONTEND_URL}/complete-profile`
      );
    } catch (err) {
      if (err instanceof UnauthorizedError && err.message === 'NO_ACCOUNT_FOUND') {
        reply.redirect(`${env.FRONTEND_URL}/login?oauth_error=no_account`);
        return;
      }
      reply.redirect(`${errorRedirectBase}oauth_failed`);
    }
  });

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedError('Missing refresh token');
    }

    const { accessToken } = await refreshAccessToken(refreshToken);

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    reply.send({ token: accessToken });
  });
}
