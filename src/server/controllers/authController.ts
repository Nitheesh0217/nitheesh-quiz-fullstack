import { randomBytes, createHash } from 'crypto';
import { sql } from 'kysely';
import { db } from '../db';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, type JwtPayload } from '../utils/jwt';
import { sendPasswordResetEmail } from '../utils/email';
import { env } from '../env';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import type { UserRole } from '../db/types';

const RESET_TOKEN_TTL_MINUTES = 30;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  school_id?: string | null;
}

export interface AuthResult {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  school_id: string | null;
  onboarding_completed: boolean;
}

interface TokenSourceUser {
  id: string;
  email: string;
  role: UserRole;
  school_id: string | null;
  token_version: number;
  onboarding_completed: boolean;
}

function toTokenPayload(user: TokenSourceUser): JwtPayload {
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    school_id: user.school_id,
    token_version: user.token_version,
    onboarding_completed: user.onboarding_completed,
  };
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', input.email)
    .executeTakeFirst();

  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await db
    .insertInto('users')
    .values({
      email: input.email,
      password_hash: passwordHash,
      name: input.name,
      role: input.role,
      school_id: input.school_id ?? null,
    })
    .returning(['id', 'email', 'name', 'role', 'school_id', 'token_version', 'onboarding_completed'])
    .executeTakeFirstOrThrow();

  const tokenPayload = toTokenPayload(user);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    school_id: user.school_id,
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
  };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.is_suspended) {
    throw new UnauthorizedError('Account is suspended');
  }

  const validPassword = await verifyPassword(password, user.password_hash);
  if (!validPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const tokenPayload = toTokenPayload(user);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    school_id: user.school_id,
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
  };
}

export async function getUserById(id: string): Promise<PublicUser | undefined> {
  return db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'role', 'school_id', 'onboarding_completed'])
    .where('id', '=', id)
    .executeTakeFirst();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  let payload: JwtPayload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'role', 'school_id', 'token_version', 'onboarding_completed'])
    .where('id', '=', payload.sub)
    .executeTakeFirst();

  if (!user) {
    throw new UnauthorizedError('User no longer exists');
  }

  if (user.token_version !== payload.token_version) {
    throw new UnauthorizedError('Session has been invalidated. Please sign in again.');
  }

  return { accessToken: signAccessToken(toTokenPayload(user)) };
}

function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface ForgotPasswordResult {
  message: string;
}

// Always succeeds from the caller's point of view - never reveals whether
// the email exists, to avoid leaking which addresses are registered users.
export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const user = await db.selectFrom('users').select(['id', 'email']).where('email', '=', email).executeTakeFirst();

  if (user) {
    // Invalidate any previous unused tokens for this user before issuing a new one.
    await db
      .updateTable('password_reset_tokens')
      .set({ used_at: new Date() })
      .where('user_id', '=', user.id)
      .where('used_at', 'is', null)
      .execute();

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await db
      .insertInto('password_reset_tokens')
      .values({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })
      .execute();

    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      // Never let an email-provider failure (e.g. RESEND_API_KEY not
      // configured yet in this environment) turn into a 500 - that would
      // both break the "always 200" contract above and leak, via the error
      // response itself, that this email belongs to a real account. The
      // token row is already committed, so a correctly configured retry
      // (or the existing token, until it expires) still works.
      console.error('Failed to send password reset email:', err);
    }
  }

  return { message: 'If that email exists, a reset link has been sent.' };
}

export interface ResetPasswordResult {
  message: string;
}

// new_password's minimum length is already enforced by resetPasswordSchema
// at the route layer, same as registerUser trusts registerSchema.
export async function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
  const tokenHash = hashResetToken(token);

  const resetToken = await db
    .selectFrom('password_reset_tokens')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .executeTakeFirst();

  if (!resetToken) {
    throw new ValidationError('Reset link is invalid or has expired.');
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('users')
      .set({
        password_hash: passwordHash,
        token_version: sql`token_version + 1`,
      })
      .where('id', '=', resetToken.user_id)
      .execute();

    await trx
      .updateTable('password_reset_tokens')
      .set({ used_at: new Date() })
      .where('id', '=', resetToken.id)
      .execute();
  });

  return { message: 'Password updated successfully. Please sign in.' };
}
