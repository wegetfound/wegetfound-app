# Stripe Setup Guide

This document explains how to plug in real Stripe credentials once your account is approved.

## Current Status
- **Billing system**: ✅ Ready (using placeholders)
- **Per-plan caps**: ✅ Ready
- **Scheduled re-scoring**: ✅ Ready
- **Stripe integration**: ⏳ Waiting for account

All placeholders are clearly marked as `placeholder_*` in `.env`. The API gracefully returns 503 ("not ready yet") if someone tries to upgrade before Stripe is configured.

---

## When You Get Your Stripe Account

### Step 1: Get API Keys
1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Developers** → **API Keys**
3. Copy:
   - **Secret Key** (starts with `sk_test_...` for test mode)
   - **Publishable Key** (starts with `pk_test_...`)
4. Go to **Developers** → **Webhooks**
5. Create a webhook endpoint for `POST /webhooks/stripe`
6. Copy the **Signing Secret** (starts with `whsec_...`)

### Step 2: Create Products & Prices
1. Go to **Products** → **Create product**
2. Create 4 products (one per plan):
   - **Starter** ($19/mo, $190/yr)
   - **Growth** ($49/mo, $490/yr)
   - **Agency** ($149/mo, $1490/yr)
   - (Enterprise is custom; skip for now)

3. For each product, create 2 prices:
   - Monthly (e.g., $19/mo)
   - Annual (e.g., $190/yr)

4. **Important**: Set the **Lookup Key** for each price:
   - Starter Monthly: `starter_monthly`
   - Starter Annual: `starter_annual`
   - Growth Monthly: `growth_monthly`
   - Growth Annual: `growth_annual`
   - Agency Monthly: `agency_monthly`
   - Agency Annual: `agency_annual`

5. Copy each **Price ID** (starts with `price_...`)

### Step 3: Update .env
Replace placeholders in `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_XXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXX
STRIPE_PUBLISHABLE_KEY=pk_test_XXXXX
STRIPE_PRICE_STARTER_MONTHLY=price_XXXXX
STRIPE_PRICE_STARTER_ANNUAL=price_XXXXX
STRIPE_PRICE_GROWTH_MONTHLY=price_XXXXX
STRIPE_PRICE_GROWTH_ANNUAL=price_XXXXX
STRIPE_PRICE_AGENCY_MONTHLY=price_XXXXX
STRIPE_PRICE_AGENCY_ANNUAL=price_XXXXX
```

### Step 4: Test
1. Restart the API
2. As a free user, click "Upgrade to Starter"
3. You should be redirected to Stripe Checkout
4. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
5. Verify in Stripe Dashboard that the customer was created + subscription active
6. Verify in the database that `organizations.plan` changed to `'starter'`

### Step 5: Deploy
Once tested locally:
1. Set the same env vars in production (Render config or Infisical)
2. Webhook will receive live subscription events
3. Production is ready

---

## Stripe Test Mode Checklist

- [ ] API keys copied to `.env`
- [ ] Webhook secret copied to `.env`
- [ ] 3 products created (Starter, Growth, Agency)
- [ ] 6 prices created (2 per product, with lookup_keys)
- [ ] All price IDs copied to `.env`
- [ ] Webhook endpoint configured (`POST /webhooks/stripe`)
- [ ] Test card payment completes
- [ ] Organization plan updates in DB
- [ ] Verify free user can hit upgrade flow

---

## Production Migration (Live Keys)

When you're ready to go live:
1. Generate **live keys** from Stripe Dashboard (toggle from Test to Live)
2. Replace `sk_test_*` with `sk_live_*`
3. Replace `pk_test_*` with `pk_live_*`
4. Recreate products and prices in **Live mode**
5. Update webhook endpoint to production URL
6. Update `.env` in production

**Note:** Test and Live mode have completely separate products and keys. You'll need to set up products twice (once in Test, once in Live).

---

## Troubleshooting

**"Stripe not configured yet" error**
- Check `.env` for placeholder values
- If you just updated `.env`, restart the API

**Webhook not received**
- Verify webhook URL is correct and accessible from the internet
- Test via Stripe Dashboard → Webhooks → "Send test event"
- Check API logs for webhook processing

**Price ID mismatch**
- Verify `lookup_key` is set on each Stripe price (e.g., `starter_monthly`)
- Mapping happens in `stripe.ts` via `mapStripePriceToPlan()`

---

## Architecture Notes

The system is designed to work with or without Stripe:

- **With placeholders**: API runs fine, just returns 503 on checkout/webhook
- **With real keys**: Full billing flow works end-to-end
- **Seamless swap**: Just update `.env` and restart

No code changes needed. Everything is wired up and waiting.
