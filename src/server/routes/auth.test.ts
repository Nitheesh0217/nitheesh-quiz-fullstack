import { randomBytes, createHash } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { buildApp } from '../app';
import { db } from '../db';
import { redis } from '../utils/redis';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../utils/cookies';
import { env } from '../env';
import { signAccessToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

describe('Auth Endpoints Integration', () => {
  const app = buildApp();
  const testEmail = 'test-auth@school.edu';
  const testPassword = 'super-secret-password-123';
  const testName = 'Test User';
  const testRole = 'student';

  beforeAll(async () => {
    await app.ready();
    // Clean up any existing test user before starting
    await db.deleteFrom('users').where('email', '=', testEmail).execute();
  });

  // This file reuses the same email/IP across many /login and /register
  // calls (app.inject always reports 127.0.0.1) - clear the rate-limit
  // counters before every test so earlier tests never trip a later one's
  // assertions on an unrelated 429.
  beforeEach(async () => {
    const keys = await redis.keys('rate:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    // Clean up user after testing
    await db.deleteFrom('users').where('email', '=', testEmail).execute();
    await app.close();
    await db.destroy();
  });

  it('should successfully register a new user and set HTTP-only cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: testEmail,
        password: testPassword,
        name: testName,
        role: testRole,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.email).toBe(testEmail);
    expect(body.role).toBe(testRole);
    expect(body.user_id).toBeDefined();

    // Check set-cookie header
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    
    const hasAccessToken = cookieArray.some(c => c.includes(ACCESS_TOKEN_COOKIE));
    const hasRefreshToken = cookieArray.some(c => c.includes(REFRESH_TOKEN_COOKIE));

    expect(hasAccessToken).toBe(true);
    expect(hasRefreshToken).toBe(true);

    // Regression test: these cookies must be SameSite=Lax, not Strict.
    // Strict cookies are unreliable on the landing request right after the
    // Google OAuth redirect back from accounts.google.com (a genuinely
    // cross-site-originated top-level navigation), which silently broke
    // every OAuth sign-in/sign-up attempt - the session cookie just never
    // stuck on the frontend. Password login isn't part of that redirect
    // chain, so this regression wouldn't show up in a login/register-only
    // test - it has to be asserted explicitly here.
    cookieArray.forEach((c) => expect(c.toLowerCase()).not.toContain('samesite=strict'));
  });

  it('should fail registration when email is already taken', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: testEmail,
        password: testPassword,
        name: testName,
        role: testRole,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Email is already registered');
  });

  it('should block registration when role is admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'attacker-admin@school.edu',
        password: 'attackerspassword123',
        name: 'Attacker Admin',
        role: 'admin',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('should successfully login and set cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.token).toBeDefined();

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
  });

  it('should fail login with wrong password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: 'incorrect-password',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid email or password');
  });

  it('should fetch authenticated user profile on /me endpoint with cookies', async () => {
    // First, login to get cookies
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : (cookies as string);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);
    expect(body.email).toBe(testEmail);
    expect(body.name).toBe(testName);
    expect(body.role).toBe(testRole);
  });

  it('should deny access to /me endpoint when access token cookie is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should successfully sign out and clear cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    
    // Cookies should be set to expire immediately / empty
    const accessCleared = cookieArray.some(c => c.includes(`${ACCESS_TOKEN_COOKIE}=;`));
    const refreshCleared = cookieArray.some(c => c.includes(`${REFRESH_TOKEN_COOKIE}=;`));
    expect(accessCleared).toBe(true);
    expect(refreshCleared).toBe(true);
    expect(cookieArray.length).toBeGreaterThanOrEqual(2);
  });

  it('should redirect to Google consent screen on /google endpoint', async () => {
    // Set environment variables on the parsed env config before testing
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
  });

  it('should redirect to Google consent screen on /google endpoint with intent=login and no role/school in state', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google?intent=login',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');

    const location = response.headers.location!;
    const stateParam = new URL(location).searchParams.get('state')!;
    expect(stateParam).toContain(':login');
    expect(stateParam).not.toContain(':register');
  });

  it('should encode only a CSRF value and the register intent in state, with no role/school', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google?intent=register',
    });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location!;
    const stateParam = new URL(location).searchParams.get('state')!;
    // "<random-hex>:register" - nothing else. Role/school are collected
    // later via POST /api/auth/complete-profile, not up front.
    expect(stateParam).toMatch(/^[0-9a-f]+:register$/);
  });

  it('ignores role/school_id query params on /google - they no longer have any effect', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google?intent=register&role=teacher&school_id=00000000-0000-0000-0000-000000000000',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    expect(response.headers.location).toContain('client_id=test-client-id');

    const location = response.headers.location!;
    const stateParam = new URL(location).searchParams.get('state')!;
    expect(stateParam).toMatch(/^[0-9a-f]+:register$/);
  });

  it('should sign in an existing user via Google without any role/school in state (login intent)', async () => {
    // Pre-create the user exactly as if they'd registered with a password previously.
    const pwHash = await hashPassword('irrelevant-password-123');
    const existing = await db
      .insertInto('users')
      .values({
        email: 'oauth-existing@school.edu',
        password_hash: pwHash,
        name: 'Existing OAuth User',
        role: 'teacher',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const mockCode = 'mock-google-auth-code';
    const mockState = 'mock-csrf-state:login';

    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'mock-access-token',
            expires_in: 3600,
            scope: 'openid email profile',
            token_type: 'Bearer',
          }),
        } as any;
      }
      if (url.toString().includes('openidconnect.googleapis.com/v1/userinfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: 'google-sub-id-123',
            name: 'Existing OAuth User',
            email: 'oauth-existing@school.edu',
            email_verified: true,
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${mockCode}&state=${mockState}`,
      cookies: {
        oauth_state: mockState,
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/dashboard');

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
    const hasAccessToken = cookieArray.some(c => c.includes(ACCESS_TOKEN_COOKIE));
    const hasRefreshToken = cookieArray.some(c => c.includes(REFRESH_TOKEN_COOKIE));
    expect(hasAccessToken).toBe(true);
    expect(hasRefreshToken).toBe(true);

    fetchSpy.mockRestore();
    await db.deleteFrom('users').where('id', '=', existing.id).execute();

    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;
  });

  it('should create a bare incomplete account for a new email on register intent and redirect to /complete-profile, never /login', async () => {
    const mockCode = 'mock-google-auth-code-bare-signup';
    const mockState = 'mock-csrf-state:register';

    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-access-token', expires_in: 3600, token_type: 'Bearer' }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sub: 'google-sub-id-bare',
          name: 'Bare Signup User',
          email: 'oauth-bare-signup@school.edu',
          email_verified: true,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${mockCode}&state=${mockState}`,
      cookies: { oauth_state: mockState },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/complete-profile`);

    // Regression test - see the identical assertion on /register for why:
    // Strict cookies here would get silently dropped on the very next
    // request (the browser following this redirect back to the frontend).
    const oauthCookies = response.headers['set-cookie'];
    const oauthCookieArray = Array.isArray(oauthCookies) ? oauthCookies : [oauthCookies as string];
    oauthCookieArray.forEach((c) => expect(c.toLowerCase()).not.toContain('samesite=strict'));

    const userInDb = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'oauth-bare-signup@school.edu')
      .executeTakeFirstOrThrow();
    expect(userInDb.role).toBe('student');
    expect(userInDb.school_id).toBeNull();
    expect(userInDb.onboarding_completed).toBe(false);

    fetchSpy.mockRestore();
    await db.deleteFrom('users').where('id', '=', userInDb.id).execute();
  });

  it('should send a returning-but-still-incomplete user back to /complete-profile (not /login) even on login intent', async () => {
    const pwHash = await hashPassword(randomBytes(16).toString('hex'));
    const incompleteUser = await db
      .insertInto('users')
      .values({
        email: 'oauth-still-pending@school.edu',
        password_hash: pwHash,
        name: 'Still Pending User',
        role: 'student',
        school_id: null,
        onboarding_completed: false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const mockCode = 'mock-google-auth-code-still-pending';
    const mockState = 'mock-csrf-state:login';

    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-access-token', expires_in: 3600, token_type: 'Bearer' }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sub: 'google-sub-id-still-pending',
          name: 'Still Pending User',
          email: 'oauth-still-pending@school.edu',
          email_verified: true,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${mockCode}&state=${mockState}`,
      cookies: { oauth_state: mockState },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/complete-profile`);
    expect(response.headers.location).not.toContain('/login');

    fetchSpy.mockRestore();
    await db.deleteFrom('users').where('id', '=', incompleteUser.id).execute();

    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;
  });

  it('should reject Google sign-in for a nonexistent user and redirect to login with no_account, without creating an account', async () => {
    const mockCode = 'mock-google-auth-code-no-account';
    const mockState = 'mock-csrf-state:login';

    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'mock-access-token',
            expires_in: 3600,
            scope: 'openid email profile',
            token_type: 'Bearer',
          }),
        } as any;
      }
      if (url.toString().includes('openidconnect.googleapis.com/v1/userinfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub: 'google-sub-id-no-account',
            name: 'Nobody Yet',
            email: 'oauth-nobody@school.edu',
            email_verified: true,
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${mockCode}&state=${mockState}`,
      cookies: {
        oauth_state: mockState,
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/login?oauth_error=no_account`);

    const userInDb = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'oauth-nobody@school.edu')
      .executeTakeFirst();
    expect(userInDb).toBeUndefined();

    fetchSpy.mockRestore();
    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;
  });

  it('should return 500 for unhandled internal errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-internal-error',
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe('INTERNAL_ERROR');
  });

  it('should map a raw Postgres unique-violation (23505) to a clean 409 instead of a 500', async () => {
    // Covers the TOCTOU case where two requests both pass an app-level
    // "does this already exist" check before either commits - the DB
    // constraint is the real backstop, and its error must not leak as a 500.
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-postgres-unique-violation',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
  });

  it('should map a raw Postgres foreign-key-violation (23503) to a clean 400 instead of a 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-postgres-fk-violation',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('should surface Fastify framework 4xx errors with their real status code instead of a generic 500', async () => {
    // Malformed JSON body — Fastify's own body parser throws a FastifyError
    // with statusCode 400, distinct from our ValidationError/ZodError paths.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{ this is not valid json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).not.toBe('INTERNAL_ERROR');
  });

  it('should reject request bodies larger than the configured limit with 413, not 500', async () => {
    const oversizedPayload = JSON.stringify({ email: 'a@a.com', password: 'x'.repeat(8 * 1024 * 1024) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: oversizedPayload,
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('FST_ERR_CTP_BODY_TOO_LARGE');
  });

  it('should return 503 when Google OAuth is not configured', async () => {
    // Ensure they are undefined
    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('SERVICE_UNAVAILABLE');
  });

  it('should return 401 on /me if user no longer exists in database', async () => {
    // Generate token for a non-existent user UUID
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
    const fakeToken = signAccessToken({
      sub: nonExistentUserId,
      email: 'fake@school.edu',
      role: 'student',
      school_id: null,
      token_version: 0,
      onboarding_completed: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: `${ACCESS_TOKEN_COOKIE}=${fakeToken}`,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should redirect with access_denied on google callback error query parameter', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?error=access_denied',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('oauth_error=access_denied');
  });

  it('should redirect with invalid_state on google callback state mismatch', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mockcode&state=badstate',
      cookies: {
        oauth_state: 'expectedstate',
      },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('oauth_error=invalid_state');
  });

  it('should redirect with oauth_failed on google callback token exchange failure', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        text: async () => 'mock token exchange error',
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mockcode&state=expectedstate',
      cookies: {
        oauth_state: 'expectedstate',
      },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('oauth_error=oauth_failed');

    fetchSpy.mockRestore();
  });

  it('should successfully refresh access token and set cookies', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : (cookies as string);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: cookieHeader,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeDefined();
  });

  it('should fail refresh when refresh token is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return 503 on callback when Google OAuth is not configured', async () => {
    env.GOOGLE_CLIENT_ID = undefined;
    env.GOOGLE_CLIENT_SECRET = undefined;

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback',
    });
    expect(response.statusCode).toBe(503);
  });

  it('should fail refresh when refresh token is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=invalid-token`,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should fail refresh when user in refresh token no longer exists', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
    const { signRefreshToken } = await import('../utils/jwt');
    const fakeRefreshToken = signRefreshToken({
      sub: nonExistentUserId,
      email: 'fake@school.edu',
      role: 'student',
      school_id: null,
      token_version: 0,
      onboarding_completed: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: {
        cookie: `${REFRESH_TOKEN_COOKIE}=${fakeRefreshToken}`,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should successfully get list of schools for registration', async () => {
    // Clean up schools table first to trigger fallback creation
    await db.deleteFrom('schools').execute();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/schools',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].name).toBe('Concentrate Academy');
  });

  it('should fail login with non-existent email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'does-not-exist@school.edu',
        password: testPassword,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should fail login with suspended user account', async () => {
    // 1. Mark user as suspended
    await db.updateTable('users').set({ is_suspended: true }).where('email', '=', testEmail).execute();

    // 2. Try logging in
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Account is suspended');

    // Restore user status
    await db.updateTable('users').set({ is_suspended: false }).where('email', '=', testEmail).execute();
  });

  it('should redirect with oauth_failed on userinfo query failure', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'mock-access-token',
            id_token: 'mock-id-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        } as any;
      }
      return { ok: false, status: 400 } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mockcode&state=expectedstate',
      cookies: {
        oauth_state: 'expectedstate',
      },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('oauth_error=oauth_failed');

    fetchSpy.mockRestore();
  });

  it('should redirect with oauth_failed if user is suspended during callback', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    // 1. Create a suspended user in the db
    const pwHash = await hashPassword('password123');
    const suspendedUser = await db
      .insertInto('users')
      .values({
        email: 'suspended-oauth@school.edu',
        password_hash: pwHash,
        name: 'Suspended OAuth',
        role: 'student',
        is_suspended: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 2. Mock fetch to return this user's email
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'mock-access-token',
            id_token: 'mock-id-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sub: 'google-sub-id',
          email: 'suspended-oauth@school.edu',
          email_verified: true,
          name: 'Suspended OAuth',
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mockcode&state=expectedstate',
      cookies: {
        oauth_state: 'expectedstate',
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('oauth_error=oauth_failed');

    fetchSpy.mockRestore();
    // Clean up
    await db.deleteFrom('users').where('id', '=', suspendedUser.id).execute();
  });

  it('should ignore any legacy role/school encoded in state and still only create a bare student account', async () => {
    // Old clients (or a stale cached page) might still send a state value
    // shaped like the pre-onboarding-screen format
    // (":register:teacher:<school-id>") - the callback must not parse or
    // honor any of that anymore. Role/school are only ever set later via
    // POST /api/auth/complete-profile.
    const mockCode = 'mock-google-auth-code-legacy-state';
    const mockState = 'csrfState:register:teacher:00000000-0000-0000-0000-000000000000';

    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-access-token', expires_in: 3600, token_type: 'Bearer' }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sub: 'google-sub-id-legacy-state',
          name: 'Legacy State User',
          email: 'oauth-legacy-state@school.edu',
          email_verified: true,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${mockCode}&state=${mockState}`,
      cookies: { oauth_state: mockState },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/complete-profile`);
    fetchSpy.mockRestore();

    const userInDb = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'oauth-legacy-state@school.edu')
      .executeTakeFirstOrThrow();
    expect(userInDb.role).toBe('student');
    expect(userInDb.school_id).toBeNull();
    expect(userInDb.onboarding_completed).toBe(false);

    await db.deleteFrom('users').where('id', '=', userInDb.id).execute();
  });

  it('should successfully run OAuth callback when user profile has no name, falling back to the email', async () => {
    env.GOOGLE_CLIENT_ID = 'test-client-id';
    env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.toString().includes('token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'mock-access-token',
            id_token: 'mock-id-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          sub: 'google-sub-id-3',
          email: 'oauth-student-no-name@school.edu',
          email_verified: true,
        }),
      } as any;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mockcode&state=expectedstate:register',
      cookies: {
        oauth_state: 'expectedstate:register',
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/complete-profile`);

    const userInDb = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'oauth-student-no-name@school.edu')
      .executeTakeFirstOrThrow();
    expect(userInDb.name).toBe('oauth-student-no-name@school.edu');

    fetchSpy.mockRestore();
    await db.deleteFrom('users').where('id', '=', userInDb.id).execute();
  });

  it('should redirect to register page with oauth_error on google callback error if state represents registration', async () => {
    const mockState = 'csrfState:register:student:some-school-id';
    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?error=access_denied&state=${mockState}`,
      cookies: {
        oauth_state: mockState,
      },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${env.FRONTEND_URL}/register?oauth_error=access_denied`);
  });

  describe('POST /complete-profile', () => {
    async function createBareUser(email: string) {
      return db
        .insertInto('users')
        .values({
          email,
          password_hash: await hashPassword(randomBytes(16).toString('hex')),
          name: 'Bare Profile User',
          role: 'student',
          school_id: null,
          onboarding_completed: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    function cookieFor(user: { id: string; email: string }) {
      const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: 'student',
        school_id: null,
        token_version: 0,
        onboarding_completed: false,
      });
      return `${ACCESS_TOKEN_COOKIE}=${token}`;
    }

    it('should resolve a bare account into a real role/school and re-sign cookies', async () => {
      const user = await createBareUser('complete-profile-success@school.edu');
      const school = await db.selectFrom('schools').selectAll().executeTakeFirst();
      const schoolId = school?.id ?? (await db.insertInto('schools').values({ name: 'Test School' }).returningAll().executeTakeFirstOrThrow()).id;

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        headers: { cookie: cookieFor(user) },
        payload: { role: 'teacher', school_id: schoolId },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.role).toBe('teacher');
      expect(body.school_id).toBe(schoolId);
      expect(body.token).toBeDefined();

      const cookies = response.headers['set-cookie'];
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies as string];
      expect(cookieArray.some((c) => c.includes(ACCESS_TOKEN_COOKIE))).toBe(true);
      expect(cookieArray.some((c) => c.includes(REFRESH_TOKEN_COOKIE))).toBe(true);

      const userInDb = await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();
      expect(userInDb.role).toBe('teacher');
      expect(userInDb.school_id).toBe(schoolId);
      expect(userInDb.onboarding_completed).toBe(true);

      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should reject role=admin with a 400 and leave the account unchanged', async () => {
      const user = await createBareUser('complete-profile-admin-reject@school.edu');
      const school = await db.selectFrom('schools').selectAll().executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        headers: { cookie: cookieFor(user) },
        payload: { role: 'admin', school_id: school.id },
      });

      expect(response.statusCode).toBe(400);

      const userInDb = await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();
      expect(userInDb.role).toBe('student');
      expect(userInDb.onboarding_completed).toBe(false);

      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should return 401 without a valid session', async () => {
      const school = await db.selectFrom('schools').selectAll().executeTakeFirstOrThrow();
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        payload: { role: 'student', school_id: school.id },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for a school_id that is not a valid uuid', async () => {
      const user = await createBareUser('complete-profile-bad-school@school.edu');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        headers: { cookie: cookieFor(user) },
        payload: { role: 'student', school_id: 'not-a-uuid' },
      });

      expect(response.statusCode).toBe(400);
      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should return 400 for a school_id that is a valid uuid but no such school exists', async () => {
      const user = await createBareUser('complete-profile-nonexistent-school@school.edu');

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        headers: { cookie: cookieFor(user) },
        payload: { role: 'student', school_id: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(400);
      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should reject with 409 when an already-onboarded user calls it - prevents self-promotion/school-hopping', async () => {
      const school = await db.selectFrom('schools').selectAll().executeTakeFirstOrThrow();
      const student = await db
        .insertInto('users')
        .values({
          email: 'complete-profile-already-onboarded@school.edu',
          password_hash: await hashPassword(randomBytes(16).toString('hex')),
          name: 'Already Onboarded Student',
          role: 'student',
          school_id: school.id,
          onboarding_completed: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const token = signAccessToken({
        sub: student.id,
        email: student.email,
        role: 'student',
        school_id: school.id,
        token_version: 0,
        onboarding_completed: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/complete-profile',
        headers: { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` },
        payload: { role: 'teacher', school_id: school.id },
      });

      expect(response.statusCode).toBe(409);

      const userInDb = await db.selectFrom('users').selectAll().where('id', '=', student.id).executeTakeFirstOrThrow();
      expect(userInDb.role).toBe('student');

      await db.deleteFrom('users').where('id', '=', student.id).execute();
    });
  });

  describe('rate limiting', () => {
    it('should return 429 on /login after 5 attempts for the same ip+email within the window', async () => {
      const email = 'rate-limited-login@school.edu';

      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email, password: 'wrong-password' },
        });
        expect(res.statusCode).toBe(401);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'wrong-password' },
      });

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error).toContain('Too many attempts');
    });

    it('should return 429 on /register after 10 attempts from the same ip regardless of email', async () => {
      const createdEmails: string[] = [];

      for (let i = 0; i < 10; i++) {
        const email = `rate-limited-register-${i}@school.edu`;
        createdEmails.push(email);
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: { email, password: 'password123', name: 'Rate Test', role: 'student' },
        });
        expect(res.statusCode).toBe(201);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'one-more@school.edu', password: 'password123', name: 'Rate Test', role: 'student' },
      });

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error).toContain('Too many attempts');

      await db.deleteFrom('users').where('email', 'in', createdEmails).execute();
    });
  });

  describe('POST /forgot-password', () => {
    // This suite's shared `testEmail` user gets fully wiped by an earlier
    // "database is cleared" coverage test, so these tests use their own
    // dedicated, self-contained user instead of depending on it.
    const forgotFlowEmail = 'forgot-password-flow@school.edu';
    let forgotFlowUserId: string;

    beforeAll(async () => {
      await db.deleteFrom('users').where('email', '=', forgotFlowEmail).execute();
      const user = await db
        .insertInto('users')
        .values({
          email: forgotFlowEmail,
          password_hash: await hashPassword('original-password-123'),
          name: 'Forgot Flow User',
          role: 'student',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      forgotFlowUserId = user.id;
    });

    afterAll(async () => {
      await db.deleteFrom('users').where('id', '=', forgotFlowUserId).execute();
    });

    it('should always return 200 with a generic message for an existing email, and create a reset token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: forgotFlowEmail },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('If that email exists, a reset link has been sent.');

      const tokenRow = await db
        .selectFrom('password_reset_tokens')
        .selectAll()
        .where('user_id', '=', forgotFlowUserId)
        .where('used_at', 'is', null)
        .executeTakeFirst();

      expect(tokenRow).toBeDefined();
    });

    it('should return the same generic 200 message for a nonexistent email (no user enumeration)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'definitely-not-registered@school.edu' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('If that email exists, a reset link has been sent.');
    });

    it('should invalidate a previous unused reset token when a new one is requested', async () => {
      const first = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: forgotFlowEmail },
      });
      expect(first.statusCode).toBe(200);

      const firstToken = await db
        .selectFrom('password_reset_tokens')
        .selectAll()
        .where('user_id', '=', forgotFlowUserId)
        .where('used_at', 'is', null)
        .executeTakeFirstOrThrow();

      const second = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: forgotFlowEmail },
      });
      expect(second.statusCode).toBe(200);

      const firstTokenAfter = await db
        .selectFrom('password_reset_tokens')
        .selectAll()
        .where('id', '=', firstToken.id)
        .executeTakeFirstOrThrow();

      expect(firstTokenAfter.used_at).not.toBeNull();
    });

    it('should still return 200 (not 500) if the email provider fails to send', async () => {
      const originalNodeEnv = env.NODE_ENV;
      const originalResendKey = env.RESEND_API_KEY;
      // Force sendPasswordResetEmail's "throw outside test env" branch so we
      // can prove forgotPassword swallows the failure instead of 500ing -
      // this exact failure mode is reachable any time RESEND_API_KEY isn't
      // configured yet in a real deployment.
      env.NODE_ENV = 'production';
      env.RESEND_API_KEY = undefined;

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: forgotFlowEmail },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('If that email exists, a reset link has been sent.');

      env.NODE_ENV = originalNodeEnv;
      env.RESEND_API_KEY = originalResendKey;
    });

    it('should return 400 for a malformed email on /forgot-password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 429 on /forgot-password after 3 attempts for the same ip+email', async () => {
      const email = 'rate-limited-forgot@school.edu';

      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/forgot-password',
          payload: { email },
        });
        expect(res.statusCode).toBe(200);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email },
      });

      expect(blocked.statusCode).toBe(429);
    });
  });

  describe('POST /reset-password', () => {
    async function seedResetToken(userId: string, opts?: { expired?: boolean; used?: boolean }): Promise<string> {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await db
        .insertInto('password_reset_tokens')
        .values({
          user_id: userId,
          token_hash: tokenHash,
          expires_at: opts?.expired ? new Date(Date.now() - 60 * 1000) : new Date(Date.now() + 30 * 60 * 1000),
          used_at: opts?.used ? new Date() : null,
        })
        .execute();
      return rawToken;
    }

    it('should reset the password with a valid token and invalidate existing refresh tokens', async () => {
      const resetPw = 'reset-flow-password-123';
      const user = await db
        .insertInto('users')
        .values({
          email: 'reset-flow@school.edu',
          password_hash: await hashPassword(resetPw),
          name: 'Reset Flow User',
          role: 'student',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: resetPw },
      });
      expect(loginRes.statusCode).toBe(200);
      const cookies = loginRes.headers['set-cookie'];
      const oldRefreshCookie = (Array.isArray(cookies) ? cookies : [cookies as string]).find((c) =>
        c.startsWith(`${REFRESH_TOKEN_COOKIE}=`)
      )!;

      const rawToken = await seedResetToken(user.id);
      const newPassword = 'brand-new-password-456';

      const resetRes = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: rawToken, new_password: newPassword },
      });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.json().message).toBe('Password updated successfully. Please sign in.');

      // Old refresh token (issued before the reset) must now be rejected.
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { cookie: oldRefreshCookie },
      });
      expect(refreshRes.statusCode).toBe(401);

      // New password works; old one no longer does.
      const loginWithNewPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: newPassword },
      });
      expect(loginWithNewPassword.statusCode).toBe(200);

      const loginWithOldPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: resetPw },
      });
      expect(loginWithOldPassword.statusCode).toBe(401);

      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should return 400 for a token that does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'nonexistent-token', new_password: 'whatever-password-123' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Reset link is invalid or has expired.');
    });

    it('should return 400 for an expired token', async () => {
      const user = await db
        .insertInto('users')
        .values({
          email: 'expired-token-flow@school.edu',
          password_hash: await hashPassword('irrelevant-password-123'),
          name: 'Expired Token Flow',
          role: 'student',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const rawToken = await seedResetToken(user.id, { expired: true });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: rawToken, new_password: 'whatever-password-123' },
      });
      expect(res.statusCode).toBe(400);

      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should return 400 for an already-used token', async () => {
      const user = await db
        .insertInto('users')
        .values({
          email: 'used-token-flow@school.edu',
          password_hash: await hashPassword('irrelevant-password-123'),
          name: 'Used Token Flow',
          role: 'student',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const rawToken = await seedResetToken(user.id, { used: true });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: rawToken, new_password: 'whatever-password-123' },
      });
      expect(res.statusCode).toBe(400);

      await db.deleteFrom('users').where('id', '=', user.id).execute();
    });

    it('should return 400 for a new_password shorter than 8 characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'irrelevant-too-short-password', new_password: 'short' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
