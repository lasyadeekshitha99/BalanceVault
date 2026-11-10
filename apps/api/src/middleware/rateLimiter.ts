import { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../config/redis.js';

export function rateLimiter(options: { limit?: number; windowSeconds?: number; prefix?: string } = {}) {
  const limit = options.limit || 100;
  const windowSeconds = options.windowSeconds || 60;
  const prefix = options.prefix || 'global';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Key by IP and prefix (or authenticated user id if present)
    const identifier = req.user?.id || req.ip || 'anonymous';
    const key = `${prefix}:${identifier}`;

    try {
      const result = await checkRateLimit(key, limit, windowSeconds);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.limit - result.current));
      res.setHeader('X-RateLimit-Reset', result.ttlSeconds);

      if (!result.allowed) {
        res.setHeader('Retry-After', result.ttlSeconds);
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please retry in ${result.ttlSeconds} seconds.`
        });
        return;
      }

      next();
    } catch {
      // In case of any rate-limiting exception, fail open to avoid service outage
      next();
    }
  };
}

