import Redis from 'ioredis';
import { env } from '../env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: true,
});

redis.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    console.error('Redis connection error:', err);
  }
});
