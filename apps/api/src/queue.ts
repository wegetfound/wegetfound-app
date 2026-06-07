import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

// Initialize Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

// Create job queues
export const scoreQueue = new Queue('score-calculate', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const emailQueue = new Queue('email-send', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

/**
 * Clean up queue resources on process exit.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    scoreQueue.close(),
    emailQueue.close(),
    redis.quit(),
  ]);
}

/**
 * Test Redis connection.
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    console.log('Redis connected');
    return true;
  } catch (err) {
    console.error('Redis connection failed:', err);
    return false;
  }
}
