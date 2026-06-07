/**
 * Stripe configuration and price lookups.
 * Map local plan enums to Stripe price IDs.
 */

export type Plan = 'free' | 'starter' | 'growth' | 'agency' | 'enterprise';
export type Frequency = 'monthly' | 'annual';

export function getPriceIdForPlan(plan: Plan, frequency: Frequency = 'monthly'): string | null {
  const envVar = `STRIPE_PRICE_${plan.toUpperCase()}_${frequency.toUpperCase()}`;
  return process.env[envVar] || null;
}

/**
 * Plan pricing in cents (USD).
 * Used for display purposes and verification.
 */
export const PLAN_PRICING: Record<Plan, Record<Frequency, number>> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 1900, annual: 19000 }, // $19/mo, $190/yr
  growth: { monthly: 4900, annual: 49000 }, // $49/mo, $490/yr
  agency: { monthly: 14900, annual: 149000 }, // $149/mo, $1490/yr
  enterprise: { monthly: 0, annual: 0 }, // Custom pricing
};

export function formatPrice(cents: number, currency = 'USD'): string {
  const dollars = cents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });
  return formatter.format(dollars);
}
