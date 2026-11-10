import Redis from 'ioredis';
import { config } from './env.js';

let redisClient: Redis | null = null;
let isRedisConnected = false;

// Fallback in-memory store for rate limiting when Redis is not running locally
const memoryStore = new Map<string, { count: number; resetAt: number }>();

if (config.enableRedis) {
  try {
    redisClient = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          // Fall back gracefully to memory
          return null;
        }
        return Math.min(times * 200, 2000);
      }
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log(' [Redis] Successfully connected to Redis instance');
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      // Suppress spammy disconnect logs in local dev when redis is intentionally offline
    });

    // Attempt initial async connection without crashing server
    redisClient.connect().catch(() => {
      isRedisConnected = false;
    });
  } catch (err) {
    isRedisConnected = false;
  }
}

export async function checkRedisConnection(): Promise<{ connected: boolean; provider: 'redis' | 'memory-fallback'; latencyMs?: number }> {
  if (redisClient && isRedisConnected) {
    const start = Date.now();
    try {
      await redisClient.ping();
      return { connected: true, provider: 'redis', latencyMs: Date.now() - start };
    } catch {
      return { connected: false, provider: 'memory-fallback' };
    }
  }
  return { connected: false, provider: 'memory-fallback' };
}

export interface RateLimiterResult {
  allowed: boolean;
  current: number;
  limit: number;
  ttlSeconds: number;
}

/**
 * Sliding window rate limit checker
 */
export async function checkRateLimit(
  key: string,
  limit: number = 60,
  windowSeconds: number = 60
): Promise<RateLimiterResult> {
  const fullKey = `ratelimit:${key}`;

  if (redisClient && isRedisConnected) {
    try {
      const current = await redisClient.incr(fullKey);
      if (current === 1) {
        await redisClient.expire(fullKey, windowSeconds);
      }
      const ttl = await redisClient.ttl(fullKey);
      return {
        allowed: current <= limit,
        current,
        limit,
        ttlSeconds: ttl > 0 ? ttl : windowSeconds
      };
    } catch {
      // Redis error, fallback to memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = memoryStore.get(fullKey);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(fullKey, {
      count: 1,
      resetAt: now + windowSeconds * 1000
    });
    return {
      allowed: true,
      current: 1,
      limit,
      ttlSeconds: windowSeconds
    };
  }

  entry.count += 1;
  const ttlSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    allowed: entry.count <= limit,
    current: entry.count,
    limit,
    ttlSeconds
  };
}

export { redisClient };

