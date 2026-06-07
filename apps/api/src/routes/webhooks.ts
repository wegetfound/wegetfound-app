import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { db, organizations, events } from '@wegetfound/db';
import { eq } from 'drizzle-orm';
import { getStripe, mapStripePriceToPlan } from '../stripe.js';
import { checkIdempotency, recordIdempotency, extractIdempotencyKey } from '../idempotency.js';
import { AppError, ErrorCodes } from '../error-handler.js';

/**
 * Stripe webhook handler. Verifies signature and processes subscription events.
 * Required events: customer.subscription.created, customer.subscription.updated,
 * customer.subscription.deleted, invoice.payment_failed
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: string }>(
    '/webhooks/stripe',
    {
      schema: { consumes: ['application/json'] },
      bodyLimit: 1048576, // 1MB limit
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        return reply.code(400).send({ error: 'Missing stripe-signature header' });
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret || webhookSecret.includes('placeholder')) {
        console.warn('Webhook received but STRIPE_WEBHOOK_SECRET not configured');
        return reply.code(503).send({
          error: 'Stripe not configured yet',
          message: 'Stripe account setup in progress',
        });
      }

      let event: Stripe.Event;
      try {
        const stripe = getStripe();
        // Fastify stores raw body in request.rawBody (set by contentParser)
        const rawBody = (request as any).rawBody || request.body;
        const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
        event = stripe.webhooks.constructEvent(bodyBuffer, signature, webhookSecret);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Webhook signature verification failed:', message);
        return reply.code(400).send({ error: 'Webhook signature verification failed' });
      }

      try {
        // Idempotency: use Stripe event ID as key
        const idempotencyKey = extractIdempotencyKey(event.id);
        const cached = await checkIdempotency<{ received: boolean }>(idempotencyKey);
        if (cached.processed) {
          app.log.info(`Webhook event ${event.id} already processed (from cache)`);
          return reply.code(200).send(cached.result || { received: true });
        }

        // Handle subscription events
        if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionCreatedOrUpdated(subscription);
        } else if (event.type === 'customer.subscription.deleted') {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(subscription);
        } else if (event.type === 'invoice.payment_failed') {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentFailed(invoice);
        }

        // Log event for audit trail
        if (event.data.object && typeof event.data.object === 'object' && 'customer' in event.data.object) {
          const customerId = (event.data.object as { customer?: string }).customer;
          if (customerId) {
            const org = await db.query.organizations.findFirst({
              where: eq(organizations.stripeCustomerId, customerId as string),
            });
            if (org) {
              await db.insert(events).values({
                organizationId: org.id,
                eventType: 'stripe.webhook_received',
                payload: {
                  stripe_event_id: event.id,
                  stripe_event_type: event.type,
                },
              });
            }
          }
        }

        const result = { received: true };
        await recordIdempotency(idempotencyKey, result);
        return reply.code(200).send(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Webhook processing error:', message, err);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}

/**
 * Handle subscription created or updated event.
 * Extract plan from price lookup_key and update organization.
 */
async function handleSubscriptionCreatedOrUpdated(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  if (!customerId) {
    console.warn('Subscription event has no customer ID');
    return;
  }

  // Find org by stripe_customer_id
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.stripeCustomerId, customerId),
  });

  if (!org) {
    console.warn(`Organization not found for Stripe customer ${customerId}`);
    return;
  }

  // Extract plan from subscription's first item
  const item = subscription.items.data?.[0];
  const lookupKey = (item?.price as any)?.lookup_key as string | undefined;
  const plan = mapStripePriceToPlan(lookupKey);

  if (!plan) {
    console.warn(`Could not map price lookup_key "${lookupKey}" to plan`);
    return;
  }

  // Update organization with new plan and subscription ID
  await db
    .update(organizations)
    .set({
      plan: plan as any,
      stripeSubscriptionId: subscription.id,
    })
    .where(eq(organizations.id, org.id));

  console.log(`Updated org ${org.id} to plan "${plan}" (subscription ${subscription.id})`);
}

/**
 * Handle subscription deleted event.
 * Downgrade organization to 'free' plan.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  if (!customerId) {
    console.warn('Subscription deletion event has no customer ID');
    return;
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.stripeCustomerId, customerId),
  });

  if (!org) {
    console.warn(`Organization not found for Stripe customer ${customerId}`);
    return;
  }

  // Downgrade to free
  await db
    .update(organizations)
    .set({
      plan: 'free',
      stripeSubscriptionId: null,
    })
    .where(eq(organizations.id, org.id));

  console.log(`Downgraded org ${org.id} to free plan (subscription deleted)`);
}

/**
 * Handle payment failed event.
 * Log the failure; user is notified by Stripe.
 * Could queue an email job here later.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  if (!customerId) {
    console.warn('Payment failure event has no customer ID');
    return;
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.stripeCustomerId, customerId),
  });

  if (!org) {
    console.warn(`Organization not found for Stripe customer ${customerId}`);
    return;
  }

  // Log the failure
  await db.insert(events).values({
    organizationId: org.id,
    eventType: 'billing.payment_failed',
    payload: {
      invoice_id: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
    },
  });

  console.log(`Payment failed for org ${org.id} (invoice ${invoice.id})`);
  // TODO: Queue email-send job for payment failure notification
}
