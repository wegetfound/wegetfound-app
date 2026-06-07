import { db, organizations, businesses } from '@wegetfound/db';
import { scoreQueue } from '../queue';
import { getCapsForPlan } from '@wegetfound/shared';

/**
 * Scheduler: enqueues score:calculate jobs for businesses based on their organization's plan.
 * - Free plan: weekly (every Monday at midnight UTC)
 * - Growth/Agency: daily (every day at midnight UTC)
 *
 * Called on server startup and can be triggered periodically via a cron service.
 */
export async function startScheduler(): Promise<void> {
  console.log('[scheduler] Starting batch scheduler');

  try {
    // Get all organizations with active businesses
    const orgs = await db.query.organizations.findMany();

    for (const org of orgs) {
      const caps = getCapsForPlan(org.plan as any);

      // Get all businesses for this org
      const bizList = await db.query.businesses.findMany({
        where: (t) => ({ organizationId: org.id }),
      });

      if (bizList.length === 0) continue;

      // Determine scoring frequency for this plan
      let frequency: 'weekly' | 'daily';
      if (org.plan === 'free') {
        frequency = 'weekly';
      } else if (['starter', 'growth', 'agency'].includes(org.plan)) {
        frequency = 'daily';
      } else {
        frequency = 'weekly'; // Default
      }

      console.log(
        `[scheduler] Org "${org.name}" (${org.plan}): scheduling ${bizList.length} businesses for ${frequency} scoring`,
      );

      // Schedule each business
      for (const biz of bizList) {
        const jobId = `${biz.id}:${frequency}`;

        try {
          // Check if job already exists to avoid duplicates
          const existing = await scoreQueue.getJob(jobId);
          if (existing) {
            console.log(`[scheduler]   ${biz.name}: job already scheduled`);
            continue;
          }

          // Enqueue with repeat pattern
          if (frequency === 'weekly') {
            // Every Monday at midnight UTC
            await scoreQueue.add(
              'score:calculate',
              { businessId: biz.id },
              {
                jobId,
                repeat: {
                  pattern: '0 0 * * 1', // Cron: Monday midnight UTC
                },
                removeOnComplete: false, // Keep job history
                removeOnFail: false,
              },
            );
            console.log(`[scheduler]   ${biz.name}: scheduled for weekly (Monday 00:00 UTC)`);
          } else {
            // Every day at midnight UTC
            await scoreQueue.add(
              'score:calculate',
              { businessId: biz.id },
              {
                jobId,
                repeat: {
                  pattern: '0 0 * * *', // Cron: every day at midnight UTC
                },
                removeOnComplete: false,
                removeOnFail: false,
              },
            );
            console.log(`[scheduler]   ${biz.name}: scheduled for daily (00:00 UTC)`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[scheduler] Failed to schedule ${biz.name}:`, msg);
        }
      }
    }

    console.log('[scheduler] Batch scheduler complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scheduler] Error:', msg);
    throw err;
  }
}

/**
 * Immediately enqueue a scoring job for a business (used for manual triggers).
 */
export async function enqueueScoreJob(businessId: string): Promise<string> {
  const job = await scoreQueue.add(
    'score:calculate',
    { businessId },
    {
      jobId: `manual:${businessId}:${Date.now()}`,
      priority: 10, // Higher priority for manual triggers
    },
  );
  return job.id;
}
