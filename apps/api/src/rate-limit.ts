/**
 * Rate limiting with Redis-backed sliding window.
 * Protects public and authenticated endpoints from abuse.
 */

import { redis } from './queue.js';
import { AppError, ErrorCodes } from './error-handler.js';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (ip: string, userId?: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const defaultKeyGenerator = (ip: string, userId?: string) => {
  if (userId) return `ratelimit:user:${userId}`;
  return `ratelimit:ip:${ip}`;
};

/**
 * Create a rate limit checker for a specific endpoint/user tier.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator = defaultKeyGenerator, skipSuccessfulRequests = false, skipFailedRequests = false } = config;

  return async (ip: string, userId?: string): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> => {
    if (!redis) {
      // If Redis unavailable, allow request (fail open for availability)
      return { allowed: true, remaining: maxRequests };
    }

    const key = keyGenerator(ip, userId);
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Use Redis sorted set with sliding window algorithm
      // Remove old entries outside window
      await redis.zremrangebyscore(key, '-inf', `(${windowStart}`);

      // Count requests in current window
      const count = await redis.zcard(key);

      if (count >= maxRequests) {
        // Get oldest request timestamp to calculate retry-after
        const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTimestamp = oldest[1] ? Number(oldest[1]) : now;
        const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

        return {
          allowed: false,
          remaining: 0,
          retryAfter: Math.max(1, retryAfter),
        };
      }

      // Add current request with timestamp as score
      await redis.zadd(key, now, `${now}:${Math.random()}`);

      // Set key expiration to window size
      await redis.expire(key, Math.ceil(windowMs / 1000));

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - count - 1),
      };
    } catch (err) {
      // If Redis errors, allow request (fail open)
      console.error('Rate limit check failed:', err);
      return { allowed: true, remaining: maxRequests };
    }
  };
}

// Pre-configured limiters for different endpoints
export const publicEndpointLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  keyGenerator: (ip) => `ratelimit:public:${ip}`,
});

export const auditFreeLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 audits per minute per IP
  keyGenerator: (ip) => `ratelimit:audit:${ip}`,
});

export const authenticatedLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute per user
  keyGenerator: (ip, userId) => `ratelimit:auth:${userId || ip}`,
});

/**
 * Throw rate limit error with retry-after header.
 */
export function throwRateLimitError(retryAfter: number): never {
  throw new AppError(
    ErrorCodes.RATE_LIMIT,
    `Too many requests. Try again in ${retryAfter} second(s).`,
    429,
    { retryAfter },
  );
}
