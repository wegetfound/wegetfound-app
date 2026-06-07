/**
 * Idempotency key handling for webhook and sensitive operations.
 * Ensures exactly-once processing of duplicate requests.
 */

import { redis } from './queue.js';

const IDEMPOTENCY_TTL = 24 * 60 * 60; // 24 hours

/**
 * Store idempotency key with result for idempotent operations.
 * Returns the stored result if key already processed, null otherwise.
 */
export async function checkIdempotency<T>(
  key: string,
): Promise<{ processed: boolean; result?: T }> {
  if (!redis) return { processed: false };

  try {
    const stored = await redis.get(`idempotency:${key}`);
    if (stored) {
      return { processed: true, result: JSON.parse(stored) };
    }
    return { processed: false };
  } catch (err) {
    console.error('Idempotency check failed:', err);
    // Fail open: allow request to proceed if Redis unavailable
    return { processed: false };
  }
}

/**
 * Record result of idempotent operation for future retrieval.
 */
export async function recordIdempotency<T>(key: string, result: T): Promise<void> {
  if (!redis) return;

  try {
    await redis.setex(`idempotency:${key}`, IDEMPOTENCY_TTL, JSON.stringify(result));
  } catch (err) {
    console.error('Idempotency recording failed:', err);
    // Don't fail the operation if recording fails; just log it
  }
}

/**
 * Generate idempotency key from webhook event ID or explicit header.
 */
export function extractIdempotencyKey(
  eventId: string,
  headerValue?: string | string[],
): string {
  // If explicit idempotency key provided, use it (for API clients)
  if (headerValue) {
    const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (key && typeof key === 'string' && key.length > 0 && key.length < 256) {
      return `user:${key}`;
    }
  }

  // For webhooks, use event ID (e.g., Stripe event ID)
  return `webhook:${eventId}`;
}
