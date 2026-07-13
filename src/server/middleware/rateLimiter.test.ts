import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../utils/redis';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from './rateLimiter';

function makeRequest(ip: string, body?: unknown): FastifyRequest {
  return { ip, body } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

describe('rateLimiter middleware', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('allows requests under the limit and keys by ip+email for loginLimiter', async () => {
    const key = `rate:login:127.0.0.10:allowed@school.edu`;
    await redis.del(key);

    const request = makeRequest('127.0.0.10', { email: 'allowed@school.edu' });
    const reply = makeReply();

    await loginLimiter(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    await redis.del(key);
  });

  it('blocks with 429 once loginLimiter max attempts are exceeded', async () => {
    const key = `rate:login:127.0.0.11:blocked@school.edu`;
    await redis.del(key);

    const request = makeRequest('127.0.0.11', { email: 'blocked@school.edu' });

    for (let i = 0; i < 5; i++) {
      const reply = makeReply();
      await loginLimiter(request, reply);
      expect(reply.status).not.toHaveBeenCalled();
    }

    const blockedReply = makeReply();
    await loginLimiter(request, blockedReply);

    expect(blockedReply.status).toHaveBeenCalledWith(429);
    expect(blockedReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Too many attempts') })
    );

    await redis.del(key);
  });

  it('keys registerLimiter by ip only, ignoring email', async () => {
    const key = `rate:register:127.0.0.12:`;
    await redis.del(key);

    const request = makeRequest('127.0.0.12', { email: 'someone@school.edu' });
    const reply = makeReply();

    await registerLimiter(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    const count = await redis.get(key);
    expect(count).toBe('1');

    await redis.del(key);
  });

  it('blocks forgotPasswordLimiter after its lower max attempts', async () => {
    const key = `rate:forgot-password:127.0.0.13:reset@school.edu`;
    await redis.del(key);

    const request = makeRequest('127.0.0.13', { email: 'reset@school.edu' });

    for (let i = 0; i < 3; i++) {
      const reply = makeReply();
      await forgotPasswordLimiter(request, reply);
      expect(reply.status).not.toHaveBeenCalled();
    }

    const blockedReply = makeReply();
    await forgotPasswordLimiter(request, blockedReply);
    expect(blockedReply.status).toHaveBeenCalledWith(429);

    await redis.del(key);
  });

  it('handles a request with no body (email key defaults to empty string)', async () => {
    const key = `rate:login:127.0.0.14:`;
    await redis.del(key);

    const request = makeRequest('127.0.0.14', undefined);
    const reply = makeReply();

    await loginLimiter(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    await redis.del(key);
  });

  it('fails open (does not block) when Redis is unavailable', async () => {
    const incrSpy = vi.spyOn(redis, 'incr').mockRejectedValueOnce(new Error('redis down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const request = makeRequest('127.0.0.15', { email: 'redis-down@school.edu' });
    const reply = makeReply();

    await loginLimiter(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    incrSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('falls back to the configured window when the Redis TTL lookup fails after exceeding the limit', async () => {
    const key = `rate:login:127.0.0.16:ttlfail@school.edu`;
    await redis.del(key);

    const request = makeRequest('127.0.0.16', { email: 'ttlfail@school.edu' });

    for (let i = 0; i < 5; i++) {
      await loginLimiter(request, makeReply());
    }

    const ttlSpy = vi.spyOn(redis, 'ttl').mockRejectedValueOnce(new Error('ttl failed'));
    const reply = makeReply();
    await loginLimiter(request, reply);

    expect(reply.status).toHaveBeenCalledWith(429);
    ttlSpy.mockRestore();

    await redis.del(key);
  });
});
