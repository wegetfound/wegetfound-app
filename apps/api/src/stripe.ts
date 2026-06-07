import Stripe from 'stripe';
import { db, organizations } from '@wegetfound/db';
import { eq } from 'drizzle-orm';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey || apiKey.includes('placeholder')) {
      throw new Error('STRIPE_SECRET_KEY not configured (awaiting Stripe account setup)');
    }
    _stripe = new Stripe(apiKey, { apiVersion: '2024-10-28.acacia' });
  }
  return _stripe;
}

/**
 * Get or create a Stripe customer for an organization.
 * Idempotent: if org already has stripe_customer_id, return it.
 */
export async function getOrCreateStripeCustomer(
  organizationId: string,
  email: string,
  name?: string,
): Promise<string> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (!org) throw new Error(`Organization ${organizationId} not found`);

  // Already has a customer ID
  if (org.stripeCustomerId) {
    return org.stripeCustomerId;
  }

  // Create new Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: name || org.name,
    metadata: {
      organizationId,
    },
  });

  // Store the Stripe customer ID
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, organizationId));

  return customer.id;
}

/**
 * Map Stripe price lookup_key to local plan enum.
 * e.g., "starter_monthly" → "starter"
 */
export function mapStripePriceToPlan(lookupKey: string | null | undefined): string | null {
  if (!lookupKey) return null;
  const match = lookupKey.match(/^([a-z]+)_/);
  if (match?.[1]) return match[1];
  return null;
}
