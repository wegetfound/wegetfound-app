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
 */
export function startScoreWorker(connection: typeof redis): Worker {
  const worker = new Worker<ScoreJobData>(
    'score:calculate',
    async (job) => {
      const { businessId } = job.data;

      try {
        console.log(`[score-worker] Processing job ${job.id} for business ${businessId}`);

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
          `[score-worker] Job ${job.id}: ${businessId} score: ${oldScore} → ${newScore} (Δ${delta > 0 ? '+' : ''}${delta})`,
        );

        // If score changed materially (>5 points), enqueue email job
        if (Math.abs(delta) > 5) {
          const business = await db.query.businesses.findFirst({
            where: eq(businesses.id, businessId),
          });

          if (business) {
            console.log(`[score-worker] Enqueueing email job for ${business.name}`);
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
              },
            );
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
        console.error(`[score-worker] Job ${job.id} failed:`, message);
        throw err;
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 scoring jobs concurrently
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
