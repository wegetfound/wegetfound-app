# Production Checklist — wegetfound.ai Rock-Solid Launch

**Goal:** Ship a production-grade SaaS with zero surprises on day one.

---

## Phase 0: Pre-Launch Setup (This Week)

### Stripe Account Setup ⚠️ BLOCKING
- [ ] Stripe account approved
- [ ] API keys in production secrets (Doppler/Infisical)
- [ ] 3 products created (Starter, Growth, Agency)
- [ ] 6 prices with correct lookup_keys
- [ ] Webhook endpoint configured + signing secret
- [ ] Test: Free → Paid → Stripe → Plan updated in DB

**See:** `STRIPE_SETUP.md`

### Infrastructure Provisioning
- [ ] **API Server** (Render/Fly/Railway)
  - [ ] Node.js 20+ runtime
  - [ ] Environment variables set
  - [ ] Health check endpoint at `/health`
  - [ ] Auto-restart on crash enabled
  - [ ] Memory limit: 512MB minimum

- [ ] **Redis** (Upstash/Fly Redis/ElastiCache)
  - [ ] 1GB memory minimum
  - [ ] Persistence enabled
  - [ ] Connection string in `.env`
  - [ ] Tested via `redis-cli ping`

- [ ] **Database** (Supabase)
  - [ ] Already configured (verified in `.env`)
  - [ ] Backups enabled (automatic daily)
  - [ ] Row-level security (RLS) policies in place

- [ ] **Email Service** (Resend)
  - [ ] Account created
  - [ ] API key in production secrets
  - [ ] From address verified (coach@wegetfound.ai)
  - [ ] Test: Send test email via API

### Web Frontend (Vercel)
- [ ] Already configured (verified in `.env`)
- [ ] Environment variables synced
- [ ] Build succeeds (`pnpm build`)
- [ ] Homepage loads without errors

---

## Phase 1: Testing (Before Deployment)

### Unit Tests
- [ ] `packages/shared/src/plan-config.ts` — Plan limits correct
- [ ] `packages/scoring/src/score.ts` — Score formula correct
- [ ] `packages/db/src/usage.ts` — Cap enforcement logic correct

**Run:**
```bash
pnpm test
```

### Integration Tests (Manual)
- [ ] **Free user cap enforcement**
  - [ ] User runs 3 audits → succeeds
  - [ ] User runs 4th audit → 429 "Daily limit reached"
  - [ ] Check logs show correct cap (3)

- [ ] **Upgrade flow**
  - [ ] Free user clicks "Upgrade to Starter"
  - [ ] Modal appears with 3 plan options
  - [ ] Click "Starter $19/mo"
  - [ ] Redirects to Stripe Checkout (or 503 if Stripe not ready)

- [ ] **Per-plan caps**
  - [ ] Manually upgrade org to 'starter' in DB
  - [ ] User can now run 10 audits/day
  - [ ] Upgrade to 'growth' → 30 audits/day
  - [ ] Verify logs show correct cap applied

- [ ] **Scheduled scoring**
  - [ ] Start Redis + API
  - [ ] Check logs: "[scheduler] Starting batch scheduler"
  - [ ] Verify: "score:calculate jobs enqueued"
  - [ ] Wait 1 minute, check: jobs processed + scores updated

- [ ] **Email notifications**
  - [ ] Score changes >5 pts enqueue email job
  - [ ] Check Resend dashboard: email sent
  - [ ] Verify email contains: old score → new score, delta

### Load Testing (Optional, Pre-Launch)
- [ ] API responds to 100 concurrent requests (no hangs)
- [ ] Webhook can receive burst events (no queue overflow)
- [ ] Score worker handles 10 jobs in parallel (no crashes)

**Tool:** `k6` or `Apache JMeter`

---

## Phase 2: Monitoring & Observability

### Error Tracking (Sentry)
- [ ] Sentry project created
- [ ] `SENTRY_DSN` in `.env`
- [ ] SDK initialized in API (`index.ts`)
- [ ] Test: Trigger error → appears in Sentry dashboard

**Setup:**
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({ dsn: process.env.SENTRY_DSN });
app.setErrorHandler(Sentry.Handlers.errorHandler());
```

### Product Analytics (PostHog)
- [ ] PostHog project created
- [ ] `POSTHOG_API_KEY` in `.env`
- [ ] Events tracked:
  - [ ] `user_signup`
  - [ ] `audit_run` (with plan)
  - [ ] `plan_upgraded` (from → to)
  - [ ] `fix_completed`
  - [ ] `prompt_tested`

**Track in routes:**
```typescript
// On subscription created:
await posthog.capture({
  distinctId: userId,
  event: 'plan_upgraded',
  properties: { from: 'free', to: 'starter' },
});
```

### Application Logs
- [ ] Structured logging configured
- [ ] Log levels: ERROR, WARN, INFO, DEBUG
- [ ] Searchable in production (Axiom, Better Stack, or Fly)
- [ ] Critical events logged:
  - [ ] Webhook received (Stripe event ID)
  - [ ] Score calculation completed (score value, delta)
  - [ ] Email sent (recipient, status)
  - [ ] Cap enforcement (org ID, cap, runs)

### Database Monitoring
- [ ] Query performance tracked (Postgres slow query log enabled)
- [ ] Backup verification (test restore procedure)
- [ ] Disk space monitored (alert at 80%)

---

## Phase 3: Security Hardening

### Secrets Management
- [ ] All `.env` secrets in Doppler/Infisical (not committed)
- [ ] Rotation schedule for API keys (quarterly)
- [ ] STRIPE_WEBHOOK_SECRET rotated after webhook URL changes
- [ ] RESEND_API_KEY can be revoked without code changes

**Verify:**
```bash
git log --all --oneline | grep -i "secret\|key\|password" # Should be empty
```

### Authentication & Authorization
- [ ] Supabase JWT verified on every protected route
- [ ] Row-level security (RLS) policies enforce org isolation
- [ ] Test: User A cannot access User B's businesses
  ```sql
  SELECT * FROM businesses WHERE id = <USER_B_BUSINESS_ID>
  -- Should return 0 rows if user A has no access
  ```

### API Security
- [ ] CORS configured (allow frontend domains only)
- [ ] Rate limiting enabled (e.g., 100 req/min per IP)
- [ ] SQL injection impossible (Drizzle ORM parameterized queries)
- [ ] XSS impossible (React escapes by default)
- [ ] CSRF tokens on forms (if applicable)

**Test:**
```bash
# CORS test
curl -i -X OPTIONS https://api.wegetfound.ai/health \
  -H "Origin: https://evil.com"
# Should NOT include Access-Control-Allow-Origin header
```

### Webhook Validation
- [ ] Stripe signature verification required
- [ ] Webhook idempotency: same event twice → processed once
- [ ] Webhook retry logic: exponential backoff on failure
- [ ] Webhook timeout: 30 seconds max

---

## Phase 4: Performance Optimization

### API Performance
- [ ] Response time <500ms for 95th percentile
- [ ] Score calculation <30 seconds (per business)
- [ ] Webhook processing <5 seconds
- [ ] Email job <10 seconds

**Monitor via:**
- Sentry performance traces
- PostHog event duration
- Application logs (timestamp deltas)

### Database Optimization
- [ ] Indexes on frequently queried columns:
  - [ ] `findability_scores(business_id, calculated_at DESC)`
  - [ ] `events(organization_id, created_at DESC)`
  - [ ] `prompt_results(tracked_prompt_id, queried_at DESC)`
- [ ] Query analysis: `EXPLAIN ANALYZE` for slow routes

### Caching Strategy
- [ ] Score history cached (Redis): 1 hour TTL
- [ ] Organization data cached (Redis): 5 min TTL
- [ ] Cache invalidation on plan change

### Frontend Performance
- [ ] Web app <3MB JS bundle
- [ ] Lighthouse score ≥90
- [ ] Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1

---

## Phase 5: Operational Runbooks

### On-Call Playbooks
Document and test each scenario:

#### Stripe Webhook Not Received
1. Check webhook signing secret matches Stripe Dashboard
2. Verify endpoint URL is accessible
3. Stripe Dashboard → Webhooks → resend test event
4. Check API logs for 400/403 errors
5. If signature mismatch: rotate secret, update code

#### Score Worker Stuck
1. Check Redis connection: `redis-cli ping`
2. Check queue jobs: `scoreQueue.getJobCounts()`
3. Check logs for errors in score-worker.ts
4. If hung: restart API pod (workers auto-restart)
5. Dead jobs: manually retry via dashboard

#### Email Not Sending
1. Check RESEND_API_KEY is set
2. Check Resend dashboard for bounce/block
3. Verify sender email (coach@wegetfound.ai) verified in Resend
4. Check email-worker logs
5. Resend is down: queue emails, retry when up

#### Database Connection Lost
1. Check Supabase status: supabase.com/status
2. Verify DATABASE_URL in production secrets
3. Restart API pod to reconnect
4. If persists: contact Supabase support
5. Fallback: promote read-replica (if configured)

#### Out of Memory
1. Check Redis memory: `redis-cli INFO memory`
2. Clear cache: `redis-cli FLUSHDB` (careful!)
3. Scale up Redis (Upstash → increase tier)
4. Check if score jobs creating large objects in memory
5. API: check for memory leaks via Clinic.js

---

## Phase 6: Customer Support & Documentation

### Support Documentation
- [ ] FAQ page (blog or help center)
- [ ] Common issues (cap hit, upgrade, email delays)
- [ ] Contact form or email (support@wegetfound.ai)
- [ ] SLA: respond within 24 hours

### Internal Documentation
- [ ] Architecture overview (diagrams)
- [ ] How to run locally (`pnpm dev`)
- [ ] Database schema documentation
- [ ] API endpoint documentation (OpenAPI spec)
- [ ] Deployment procedure

### Customer Onboarding
- [ ] Welcome email template (already built)
- [ ] First-run tutorial or explainer video
- [ ] Email: "Here's how to get your score up" (top 3 fixes)

---

## Phase 7: Launch Day Checklist

### 24 Hours Before
- [ ] All env vars set in production
- [ ] Stripe webhook endpoint responding 200
- [ ] Database backup completed
- [ ] Team on-call (Slack notifications enabled)
- [ ] Status page ready (even if just "All systems operational")

### Launch (T-0)
- [ ] Deploy API to production
- [ ] Deploy web to production
- [ ] Worker startup successful (check logs)
- [ ] Scheduler enqueued jobs (check logs)
- [ ] Test free → paid flow with real Stripe

### T+1 Hour
- [ ] Monitor Sentry for errors (should be ~0)
- [ ] Check PostHog for events (signups, audits)
- [ ] Verify emails sent (check Resend dashboard)
- [ ] Check database query performance (no slow queries)

### T+24 Hours
- [ ] Customer Zero testing complete (Pai Living, etc.)
- [ ] At least one free → paid conversion
- [ ] At least one scheduled score update
- [ ] No critical bugs reported

---

## Phase 8: Post-Launch (Week 1)

### Monitoring
- [ ] Daily check: Sentry error rate <0.1%
- [ ] Daily check: API response time <500ms p95
- [ ] Daily check: Redis memory <80% capacity
- [ ] Daily check: Database disk <85% capacity

### Bug Fixes
- [ ] Any critical bugs (security, data loss, crashes) fixed same day
- [ ] Non-critical bugs batched, fixed next week

### Metrics to Track
- [ ] Signups/day
- [ ] Free → paid conversion rate
- [ ] Score calculation time
- [ ] Email delivery rate
- [ ] API uptime

---

## Rock-Solid Criteria (All Require ✅)

| Criteria | Status | Owner |
|----------|--------|-------|
| Zero customer-facing errors on day 1 | ⏳ | Next agent |
| All 3 phases fully tested | ⏳ | Next agent |
| Monitoring (Sentry + PostHog) wired | ⏳ | Next agent |
| Webhook validation working | ⏳ | Next agent |
| Free → paid flow tested with real Stripe | ⏳ | Next agent |
| Customer Zero (Pai Living) onboarded | ⏳ | Next agent |
| RLS security verified (no data leaks) | ⏳ | Next agent |
| Scheduled scoring tested (weekly/daily) | ⏳ | Next agent |
| Email notifications tested | ⏳ | Next agent |
| Runbooks documented + tested | ⏳ | Next agent |

---

## Known Technical Debt (v2)

- ❌ No unit tests for worker jobs (v2: add vitest)
- ❌ No E2E tests (v2: add Playwright)
- ❌ No load testing (v2: add k6 before scaling)
- ❌ No database migration tests (v2: test on staging)
- ❌ No API rate limiting (v2: add via middleware)
- ❌ No log aggregation (v2: add Axiom or Better Stack)
- ⚠️ Single Redis instance (v2: add replication for HA)
- ⚠️ No multi-region deployment (v2: add failover)

**These do NOT block launch.** They improve reliability post-launch.

---

## Summary: Path to Rock-Solid

1. **Stripe Setup** (2-3 hours) ← Current blocker
2. **Deploy to Production** (2-4 hours)
3. **Monitoring Setup** (1 hour)
4. **Security Hardening** (1 hour)
5. **Testing on Production** (2 hours)
6. **Launch + Customer Zero** (2 hours)

**Total: ~10-12 hours of work.**

**Result:** A production-grade SaaS ready for customers, with zero technical surprises on day one.

---

## Questions for Next Agent

1. **Stripe status?** When account approved, follow `STRIPE_SETUP.md`
2. **Deployment platform?** Which service: Render? Fly? Railway?
3. **Monitoring?** Sentry + PostHog, or alternatives?
4. **On-call?** Who's monitoring day 1? Email alerts set up?
5. **Customer Zero?** Ready to onboard Pai Living, Pai Off-Grid, Pai Land Solutions?
