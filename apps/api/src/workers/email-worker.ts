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
 * Email Worker: processes email:send jobs from BullMQ.
 * Sends score change notifications via Resend.
 */
export function startEmailWorker(connection: typeof redis): Worker {
  const worker = new Worker<EmailJobData>(
    'email:send',
    async (job) => {
      const { organizationId, businessId, businessName, oldScore, newScore, delta } = job.data;

      try {
        console.log(`[email-worker] Processing job ${job.id} for org ${organizationId}`);

        if (!process.env.RESEND_API_KEY) {
          console.warn('[email-worker] RESEND_API_KEY not configured, skipping email send');
          return { success: true, skipped: true };
        }

        // Get org owner email
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, organizationId),
        });

        if (!org) {
          console.warn(`[email-worker] Organization ${organizationId} not found`);
          return { success: false, error: 'Organization not found' };
        }

        // Get org owner (first user in org_members)
        const owner = await db.query.organization_members.findFirst({
          where: eq(organizations.id, organizationId),
          with: { user: true },
        });

        if (!owner?.user?.email) {
          console.warn(`[email-worker] No user email for org ${organizationId}`);
          return { success: false, error: 'No user email found' };
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

        console.log(`[email-worker] Sent to ${userEmail} (${businessName}): ${result.id}`);

        return {
          success: true,
          emailId: result.id,
          recipientEmail: userEmail,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[email-worker] Job ${job.id} failed:`, message);
        // Don't throw; let BullMQ handle retry
        return { success: false, error: message };
      }
    },
    {
      connection,
      concurrency: 1, // Process emails serially to avoid rate limits
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[email-worker] Job ${job?.id} failed permanently:`, err?.message);
  });

  worker.on('completed', (job) => {
    console.log(`[email-worker] Job ${job.id} completed`);
  });

  console.log('[email-worker] Started, listening for email:send jobs');
  return worker;
}
