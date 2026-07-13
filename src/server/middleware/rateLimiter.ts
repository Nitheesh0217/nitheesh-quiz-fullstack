import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../utils/redis';

interface RateLimiterConfig {
  name: string;
  maxAttempts: number;
  windowSeconds: number;
  // Whether to fold the request body's `email` field into the rate-limit
  // key, so a single IP can't lock out an unrelated account (login/forgot
  // password) while still being throttled per-IP for endpoints that don't
  // take an email up front (register).
  keyByEmail: boolean;
}

// Same Redis incr+expire counter pattern used for /api/chat
// (see src/server/routes/chat.ts) - reused here for auth endpoints.
function createRateLimiter(config: RateLimiterConfig) {
  return async function rateLimiter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const email = config.keyByEmail
      ? String((request.body as { email?: string } | undefined)?.email ?? '').toLowerCase()
      : '';
    const key = `rate:${config.name}:${request.ip}:${email}`;

    let currentCount = 0;
    try {
      currentCount = await redis.incr(key);
      if (currentCount === 1) {
        await redis.expire(key, config.windowSeconds);
      }
    } catch (err) {
      // Graceful fallback if Redis is down - same behavior as chat.ts's limiter.
      console.warn(`Redis rate limit increment failed for ${config.name}:`, err);
      return;
    }

    if (currentCount > config.maxAttempts) {
      let ttlSeconds = config.windowSeconds;
      try {
        const ttl = await redis.ttl(key);
        if (ttl > 0) {
          ttlSeconds = ttl;
        }
      } catch {
        // Keep the window fallback above if TTL lookup fails.
      }

      const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
      reply.status(429).send({ error: `Too many attempts. Please try again in ${minutes} minutes.` });
    }
  };
}

export const loginLimiter = createRateLimiter({
  name: 'login',
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  keyByEmail: true,
});

export const registerLimiter = createRateLimiter({
  name: 'register',
  maxAttempts: 10,
  windowSeconds: 60 * 60,
  keyByEmail: false,
});

export const forgotPasswordLimiter = createRateLimiter({
  name: 'forgot-password',
  maxAttempts: 3,
  windowSeconds: 15 * 60,
  keyByEmail: true,
});
