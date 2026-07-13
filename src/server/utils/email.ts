import { Resend } from 'resend';
import { env } from '../env';

// Test env never sends real email - RESEND_API_KEY is intentionally unset in
// .env.test, and every test that triggers an email flow relies on this no-op
// rather than mocking the Resend SDK, mirroring how AI_API_KEY is treated as
// a "dummy key" in test env elsewhere in this codebase (see chat.ts).
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'test') {
      return;
    }
    throw new Error('RESEND_API_KEY is not configured. Set it to enable transactional email.');
  }

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Reset your Concentrate password',
    text: `We received a request to reset your Concentrate password.\n\nClick the link below to choose a new password. This link expires in 30 minutes.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email - your password will remain unchanged.`,
  });
}
