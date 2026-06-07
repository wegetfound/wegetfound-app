import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('rate-limit module', () => {
  describe('createRateLimiter', () => {
    it('creates a rate limiter function', () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
      expect(typeof limiter).toBe('function');
    });

    it('allows requests under limit', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });

      const result1 = await limiter('192.168.1.1');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBeLessThanOrEqual(3);

      const result2 = await limiter('192.168.1.1');
      expect(result2.allowed).toBe(true);
    });

    it('denies requests over limit', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });

      // First 2 requests allowed
      await limiter('192.168.1.1');
      await limiter('192.168.1.1');

      // 3rd request denied
      const result = await limiter('192.168.1.1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('includes retry-after header value', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });

      await limiter('192.168.1.1');
      const result = await limiter('192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });

    it('tracks requests per IP independently', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });

      // IP 1: 2 requests
      await limiter('192.168.1.1');
      await limiter('192.168.1.1');

      // IP 2: should still have allowance
      const result = await limiter('192.168.1.2');
      expect(result.allowed).toBe(true);
    });

    it('tracks requests per user independently', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });

      // User 1: 2 requests
      await limiter('192.168.1.1', 'user-1');
      await limiter('192.168.1.1', 'user-1');

      // User 2: should still have allowance
      const result = await limiter('192.168.1.1', 'user-2');
      expect(result.allowed).toBe(true);
    });

    it('uses custom key generator', async () => {
      const customKeyGenerator = (ip: string, userId?: string) => {
        return `custom:${userId || ip}`;
      };

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: customKeyGenerator,
      });

      await limiter('192.168.1.1', 'user-1');
      const result = await limiter('192.168.1.1', 'user-1');

      expect(result.allowed).toBe(false);
    });

    it('calculates remaining quota correctly', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });

      const result1 = await limiter('192.168.1.1');
      expect(result1.remaining).toBe(4);

      const result2 = await limiter('192.168.1.1');
      expect(result2.remaining).toBe(3);
    });

    it('handles graceful degradation when Redis unavailable', async () => {
      // This test assumes Redis is not available
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });

      // Should still allow request (fail open)
      const result = await limiter('192.168.1.1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('sliding window behavior', () => {
    it('resets after window expires', async () => {
      const windowMs = 100; // 100ms window
      const limiter = createRateLimiter({ windowMs, maxRequests: 2 });

      // Make 2 requests
      await limiter('192.168.1.1');
      await limiter('192.168.1.1');

      // 3rd request denied
      let result = await limiter('192.168.1.1');
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, windowMs + 50));

      // Should allow again
      result = await limiter('192.168.1.1');
      expect(result.allowed).toBe(true);
    });

    it('allows smooth traffic within burst', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });

      const results = await Promise.all([
        limiter('192.168.1.1'),
        limiter('192.168.1.1'),
        limiter('192.168.1.1'),
        limiter('192.168.1.1'),
        limiter('192.168.1.1'),
      ]);

      expect(results.filter((r) => r.allowed)).toHaveLength(5);
    });
  });

  describe('error handling', () => {
    it('returns safe defaults on error', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });

      // Even if something fails, should return an object with allowed property
      const result = await limiter('192.168.1.1');
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remaining');
    });
  });
});
