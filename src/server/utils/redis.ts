import Redis from 'ioredis';
import { env } from '../env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: true,
  connectTimeout: 10_000,
  // Bounds how long a single command can hang (e.g. a dropped connection
  // that never surfaces an error) so callers fail fast instead of stalling.
  commandTimeout: 5_000,
});

redis.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    console.error('Redis connection error:', err);
  }
});
