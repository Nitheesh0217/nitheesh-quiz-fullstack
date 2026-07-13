import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from '../env';
import { sendPasswordResetEmail } from './email';

describe('email utility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    env.RESEND_API_KEY = undefined;
  });

  it('no-ops in test env when RESEND_API_KEY is unset', async () => {
    env.RESEND_API_KEY = undefined;
    await expect(sendPasswordResetEmail('student@school.edu', 'https://app/reset?token=abc')).resolves.toBeUndefined();
  });

  it('throws a clear error outside test env when RESEND_API_KEY is unset', async () => {
    const originalEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    env.RESEND_API_KEY = undefined;

    await expect(sendPasswordResetEmail('student@school.edu', 'https://app/reset?token=abc')).rejects.toThrow(
      'RESEND_API_KEY is not configured'
    );

    env.NODE_ENV = originalEnv;
  });

  it('sends via Resend when RESEND_API_KEY is configured', async () => {
    env.RESEND_API_KEY = 'test-resend-key';

    // Emails isn't exported from the SDK directly, so spy on its shared
    // prototype (reachable via any Resend instance's `.emails` property)
    // rather than trying to import the class itself.
    const { Resend } = await import('resend');
    const probeInstance = new Resend('probe-key');
    const emailsProto = Object.getPrototypeOf(probeInstance.emails);
    const sendSpy = vi.spyOn(emailsProto, 'send').mockResolvedValue({ data: null, error: null } as any);

    await sendPasswordResetEmail('student@school.edu', 'https://app/reset?token=abc');

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@school.edu',
        subject: 'Reset your Concentrate password',
        text: expect.stringContaining('https://app/reset?token=abc'),
      })
    );

    sendSpy.mockRestore();
  });
});
