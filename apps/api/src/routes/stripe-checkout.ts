import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getStripe, getOrCreateStripeCustomer } from '../stripe.js';
import { db, organizations } from '@wegetfound/db';
import { eq } from 'drizzle-orm';
import { validateEnum } from '../validation.js';
import { AppError, ErrorCodes } from '../error-handler.js';

interface CheckoutSessionRequest {
  plan: 'starter' | 'growth' | 'agency';
  frequency?: 'monthly' | 'annual';
}

interface BillingPortalRequest {
  // No request body needed
}

/**
 * Stripe checkout endpoints for plan upgrades.
 * Requires authentication (JWT in Authorization header).
 */
export async function stripeCheckoutRoutes(app: FastifyInstance): Promise<void> {
  // POST /stripe/checkout-session
  // Creates a Stripe Checkout Session and returns the URL
  app.post<{ Body: CheckoutSessionRequest }>(
    '/stripe/checkout-session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { plan, frequency = 'monthly' } = request.body ?? {};

        // Validate plan
        const planValidation = validateEnum(plan, ['starter', 'growth', 'agency'] as const, 'plan');
        if (!planValidation.ok) {
          return reply.code(400).send({ error: planValidation.error, code: ErrorCodes.VALIDATION_ERROR });
        }

        // Validate frequency
        const frequencyValidation = validateEnum(
          frequency,
          ['monthly', 'annual'] as const,
          'frequency',
        );
        if (!frequencyValidation.ok) {
          return reply.code(400).send({ error: frequencyValidation.error, code: ErrorCodes.VALIDATION_ERROR });
        }

        const userId = request.user.sub as string;
        const userEmail = request.user.email as string;

        // Get user's active organization
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, request.user.active_org_id),
        });

        if (!org) {
          return reply.code(404).send({ error: 'Organization not found' });
        }

        // Get or create Stripe customer
        const customerId = await getOrCreateStripeCustomer(org.id, userEmail, org.name);

        // Get price ID from env vars
        const priceIdEnvVar = `STRIPE_PRICE_${planValidation.value.toUpperCase()}_${frequencyValidation.value.toUpperCase()}`;
        const priceId = process.env[priceIdEnvVar];

        if (!priceId || priceId.includes('placeholder')) {
          console.error(`Missing or placeholder env var: ${priceIdEnvVar} = ${priceId}`);
          return reply.code(503).send({
            error: 'Stripe not configured yet',
            message: 'Stripe account setup in progress. Please try again in a few days.',
            env_var: priceIdEnvVar,
          });
        }

        // Create checkout session
        const stripe = getStripe();
        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        const appUrl = process.env.APP_URL || 'http://localhost:5173';

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${appUrl}/billing-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/billing-cancel`,
          subscription_data: {
            metadata: {
              organizationId: org.id,
              userId,
            },
          },
        });

        if (!session.url) {
          return reply.code(500).send({ error: 'Failed to create checkout session' });
        }

        return reply.send({ url: session.url });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Checkout session creation error:', message);
        return reply.code(500).send({ error: 'Failed to create checkout session' });
      }
    },
  );

  // POST /stripe/billing-portal-session
  // Creates a Stripe Billing Portal Session and returns the URL
  app.post<{ Body: BillingPortalRequest }>(
    '/stripe/billing-portal-session',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, request.user.active_org_id),
        });

        if (!org) {
          return reply.code(404).send({ error: 'Organization not found' });
        }

        if (!org.stripeCustomerId) {
          return reply.code(400).send({ error: 'No billing information on file' });
        }

        const appUrl = process.env.APP_URL || 'http://localhost:5173';

        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
          customer: org.stripeCustomerId,
          return_url: `${appUrl}/dashboard`,
        });

        return reply.send({ url: session.url });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Billing portal session error:', message);
        return reply.code(500).send({ error: 'Failed to create billing portal session' });
      }
    },
  );
}
