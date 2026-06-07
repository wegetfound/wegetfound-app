import { Worker } from 'bullmq';
import { Resend } from 'resend';
import { redis } from '../queue';
import { db, users, organizations } from '@wegetfound/db';
import { scoreChangeEmailHTML } from '../email-templates';
import { eq } from 'drizzle-orm';

interface EmailJobData {
  organizationId: string;
  businessId: string;
  businessName: string;
  oldScore: number;
  newScore: number;
  delta: number;
}

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email Worker: processes email-send jobs from BullMQ.
 * Sends score change notifications via Resend.
 *
 * Retry strategy: 5 attempts with exponential backoff (5s, 25s, 125s, 625s, 3125s).
 * Fails permanently if organization/user not found.
 * Retries on transient failures (Resend API rate limits, network timeouts).
 */
export function startEmailWorker(connection: typeof redis): Worker {
  const worker = new Worker<EmailJobData>(
    'email-send',
    async (job) => {
      const { organizationId, businessId, businessName, oldScore, newScore, delta } = job.data;

      try {
        console.log(
          `[email-worker] Processing job ${job.id} (attempt ${job.attemptsMade + 1}/5) for org ${organizationId}`,
        );

        if (!process.env.RESEND_API_KEY) {
          console.warn('[email-worker] RESEND_API_KEY not configured, skipping email send');
          return { success: true, skipped: true, reason: 'API key not configured' };
        }

        // Get organization (verify it exists)
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, organizationId),
        });

        if (!org) {
          throw new Error(`PERMANENT_FAILURE: Organization ${organizationId} not found`);
        }

        // Get org owner (first user in org_members)
        const owner = await db.query.organization_members.findFirst({
          where: eq(organizations.id, organizationId),
          with: { user: true },
        });

        if (!owner?.user?.email) {
          throw new Error(`PERMANENT_FAILURE: No user email found for org ${organizationId}`);
        }

        const userEmail = owner.user.email;
        const subject =
          delta > 0
            ? `Great news! ${businessName}'s Findability Score improved`
            : `${businessName}'s Findability Score changed`;

        const html = scoreChangeEmailHTML({ businessName, oldScore, newScore, delta });

        // Send email via Resend
        const result = await resend.emails.send({
          from: 'coach@wegetfound.ai',
          to: userEmail,
          subject,
          html,
        });

        console.log(`[email-worker] Job ${job.id} sent to ${userEmail} (${businessName}): ${result.id}`);

        return {
          success: true,
          emailId: result.id,
          recipientEmail: userEmail,
          businessId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[email-worker] Job ${job.id} failed (attempt ${job.attemptsMade + 1}/5):`,
          message,
        );

        // Permanent failures: don't retry
        if (message.includes('PERMANENT_FAILURE')) {
          throw new Error(message.replace('PERMANENT_FAILURE: ', ''));
        }

        // Transient failures: retry
        throw err;
      }
    },
    {
      connection,
      concurrency: 1, // Process emails serially to avoid rate limits
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 25s, 125s, 625s, 3125s
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

  worker.on('failed', (job, err) => {
    console.error(`[email-worker] Job ${job?.id} failed permanently:`, err?.message);
  });

  worker.on('completed', (job) => {
    console.log(`[email-worker] Job ${job.id} completed`);
  });

  console.log('[email-worker] Started, listening for email-send jobs');
  return worker;
}
