import { randomBytes } from 'crypto';
import { db } from '../db';
import { env } from '../env';
import { hashPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, type JwtPayload } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import type { UserRole } from '../db/types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

export interface OAuthResult {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  onboarding_completed: boolean;
  accessToken: string;
  refreshToken: string;
}

async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new UnauthorizedError(`Google token exchange failed: ${body}`);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new UnauthorizedError('Failed to fetch Google user info');
  }

  return res.json() as Promise<GoogleUserInfo>;
}

/**
 * Exchanges an OAuth `code` for Google user info, then either signs an
 * existing user in or - only when `state` carries a "register" intent from
 * the sign-up page - creates a new one. The "sign in with Google" flow on
 * the login page never creates accounts: an unrecognized email there throws
 * NO_ACCOUNT_FOUND so the caller can send the user to sign up instead.
 *
 * A freshly created account starts bare (`role: 'student'` placeholder,
 * `school_id: null`, `onboarding_completed: false`) - the caller redirects
 * to /complete-profile instead of /dashboard until that's resolved via
 * POST /api/auth/complete-profile, which corrects the role/school and
 * re-signs the session tokens.
 */
export async function handleGoogleCallback(code: string, state: string): Promise<OAuthResult> {
  const tokenResponse = await exchangeCodeForToken(code);
  const profile = await fetchGoogleUserInfo(tokenResponse.access_token);

  let user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', profile.email)
    .executeTakeFirst();

  if (!user) {
    const intent = state.split(':')[1];

    if (intent !== 'register') {
      throw new UnauthorizedError('NO_ACCOUNT_FOUND');
    }

    // OAuth users have no password; store an unusable random hash so the
    // column's NOT NULL constraint is satisfied and password login can
    // never succeed for this account.
    const placeholderHash = await hashPassword(randomBytes(32).toString('hex'));

    user = await db
      .insertInto('users')
      .values({
        email: profile.email,
        password_hash: placeholderHash,
        name: profile.name || profile.email,
        role: 'student',
        school_id: null,
        onboarding_completed: false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  if (user.is_suspended) {
    throw new UnauthorizedError('Account is suspended');
  }

  const tokenPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    school_id: user.school_id,
    token_version: user.token_version,
    onboarding_completed: user.onboarding_completed,
  };

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    school_id: user.school_id,
    onboarding_completed: user.onboarding_completed,
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
  };
}
