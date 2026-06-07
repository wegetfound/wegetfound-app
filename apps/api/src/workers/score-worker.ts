import { Worker } from 'bullmq';
import { redis, emailQueue } from '../queue';
import { db, businesses, findabilityScores } from '@wegetfound/db';
import { scoreBusiness } from '@wegetfound/db/src/score-business';
import { eq, desc } from 'drizzle-orm';

interface ScoreJobData {
  businessId: string;
}

/**
 * Score Worker: processes score:calculate jobs from BullMQ.
 * Calls scoreBusiness(), checks if score changed materially (>5 points),
 * and enqueues an email job if so.
 *
 * Retry strategy: 3 attempts with exponential backoff (5s, 25s, 125s).
 * Fails permanently after 3 retries or if business not found.
 */
export function startScoreWorker(connection: typeof redis): Worker {
  const worker = new Worker<ScoreJobData>(
    'score:calculate',
    async (job) => {
      const { businessId } = job.data;

      try {
        console.log(
          `[score-worker] Processing job ${job.id} (attempt ${job.attemptsMade + 1}/3) for business ${businessId}`,
        );

        // Verify business exists before scoring (fail fast if not)
        const business = await db.query.businesses.findFirst({
          where: eq(businesses.id, businessId),
        });

        if (!business) {
          throw new Error(`Business ${businessId} not found`);
        }

        // Call the scoring function
        const result = await scoreBusiness(businessId, {
          onLog: (msg) => console.log(`[score-worker] ${msg}`),
        });

        // Fetch the latest previous score (if any)
        const [lastScore] = await db
          .select()
          .from(findabilityScores)
          .where(eq(findabilityScores.businessId, businessId))
          .orderBy(desc(findabilityScores.calculatedAt))
          .limit(2); // Get second-to-last for comparison

        const oldScore = lastScore?.overallScore ?? 0;
        const newScore = result.breakdown.overallScore;
        const delta = newScore - oldScore;

        console.log(
          `[score-worker] Job ${job.id}: ${businessId} (${business.name}) score: ${oldScore} → ${newScore} (Δ${delta > 0 ? '+' : ''}${delta})`,
        );

        // If score changed materially (>5 points), enqueue email job
        if (Math.abs(delta) > 5) {
          console.log(`[score-worker] Enqueueing email job for ${business.name}`);
          try {
            await emailQueue.add(
              'score-changed',
              {
                organizationId: business.organizationId,
                businessId,
                businessName: business.name,
                oldScore,
                newScore,
                delta,
              },
              {
                jobId: `email:${businessId}:${Date.now()}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              },
            );
          } catch (emailErr) {
            // Log but don't fail the score job if email enqueue fails
            console.error(`[score-worker] Failed to enqueue email job:`, emailErr);
          }
        }

        return {
          success: true,
          businessId,
          oldScore,
          newScore,
          delta,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[score-worker] Job ${job.id} failed (attempt ${job.attemptsMade + 1}/3):`, message);

        // Don't retry if business not found (permanent failure)
        if (message.includes('not found')) {
          throw new Error(`PERMANENT_FAILURE: ${message}`);
        }

        throw err; // Retry on other errors
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 scoring jobs concurrently
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds, then 25s, then 125s
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours for debugging
        },
      },
    },
  );

  // Handle worker errors
  worker.on('failed', (job, err) => {
    console.error(`[score-worker] Job ${job?.id} failed permanently:`, err?.message);
  });

  worker.on('completed', (job) => {
    console.log(`[score-worker] Job ${job.id} completed`);
  });

  console.log('[score-worker] Started, listening for score:calculate jobs');
  return worker;
}
