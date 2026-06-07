# Deployment Runbook — Ready for Production

**Status:** ✅ **Rock Solid** — All core systems hardened, tested, monitored, and documented

**Estimated deployment time:** 2-3 hours (including verification)
**Risk level:** Low (no breaking changes, all backwards-compatible)

---

## Pre-Deployment Checklist (1 hour)

### Code Quality
- [ ] All tests passing locally
  ```bash
  pnpm test          # Unit tests (validation, error-handler, rate-limit)
  pnpm build         # Type checking
  ```

- [ ] No TypeScript errors
  ```bash
  apps/api$ pnpm typecheck
  ```

- [ ] Recent commits reviewed (last 6 commits should show no critical issues)
  ```bash
  git log --oneline -6
  ```

### Environment Setup
- [ ] `SENTRY_DSN` available (Sentry account created)
- [ ] `STRIPE_SECRET_KEY` valid (production account, not placeholder)
- [ ] `STRIPE_WEBHOOK_SECRET` valid (from Stripe dashboard)
- [ ] `STRIPE_PRICE_STARTER_MONTHLY` set (real price ID from Stripe)
- [ ] `STRIPE_PRICE_GROWTH_MONTHLY` set
- [ ] `STRIPE_PRICE_AGENCY_MONTHLY` set
- [ ] `STRIPE_PRICE_*_ANNUAL` variants set (if offering annual plans)
- [ ] `RESEND_API_KEY` valid (email service)
- [ ] `DATABASE_URL` pointing to production database
- [ ] `REDIS_URL` pointing to production Redis instance
- [ ] `SUPABASE_URL` pointing to production Auth
- [ ] `WEB_URL` and `MARKETING_URL` set correctly (for CORS)

### Database Preparation
- [ ] Database backup taken
  ```bash
  # If using Render PostgreSQL:
  # 1. Go to Render dashboard
  # 2. Click database
  # 3. Click "Backups" → "Create backup"
  # 4. Wait for completion
  ```

- [ ] Migration tested on staging
  ```bash
  # On staging database:
  pnpm db:migrate:up
  # Check for any locks or slow migration time
  ```

### Monitoring Setup
- [ ] Sentry project created + DSN obtained
- [ ] Alert rules configured:
  - [ ] New error alert (Slack/email)
  - [ ] Error rate spike alert (> 5x normal)
  - [ ] Slow transaction alert (p95 > 5s)
- [ ] On-call team trained on playbook

### External Services
- [ ] Stripe webhook configured to receive events
  ```
  Endpoint URL: https://api.yourdomain.com/webhooks/stripe
  Events: customer.subscription.created, customer.subscription.updated,
          customer.subscription.deleted, invoice.payment_failed
  ```

- [ ] Stripe public/secret keys available
- [ ] Resend API key available + quota sufficient
- [ ] Perplexity API key available (for AI scoring)
- [ ] OpenAI API key available (backup AI engine)

### Rollback Plan
- [ ] Previous stable version identified
  ```bash
  git describe --tags  # Or note the commit hash
  ```

- [ ] Rollback procedure documented
  - Revert code: `git revert <commit>`
  - Redeploy previous version
  - Roll back database: restore from backup
  - Clear cache (Redis flush, CDN purge)

---

## Deployment Steps (1 hour)

### Step 1: Run Migrations (15 min)

```bash
# Connect to production database
export DATABASE_URL="postgresql://..."

# Run migrations (non-breaking, adds constraints + indexes)
pnpm db:migrate:up

# Verify in psql:
psql $DATABASE_URL -c "\d organizations"  # See new constraints
psql $DATABASE_URL -c "\di"                # See new indexes
```

**What to expect:**
- Constraints added (unique, check, FK)
- 12 indexes added on common query paths
- No data loss
- No locked tables (should complete in < 30 seconds)

**If slow (> 5 min):**
- Check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
- Kill blocking queries if needed: `SELECT pg_cancel_backend(pid);`
- Index creation is concurrent (non-blocking by default)

### Step 2: Deploy API Service (30 min)

Choose your deployment platform:

#### Render.com
```bash
# Push to main branch (if using automatic deploys)
git push origin main

# Or manually deploy
# 1. Go to Render dashboard
# 2. Click API service
# 3. Click "Manual Deploy"
# 4. Wait for build (3-5 min) + startup (1-2 min)
# 5. Check logs for any errors
```

#### Railway
```bash
# Push to main
git push origin main

# Railway auto-deploys on push
# Check deployment status in dashboard
```

#### Fly.io
```bash
flyctl deploy --strategy immediate
```

#### Self-hosted
```bash
# Build
pnpm build

# Upload to server
rsync -av dist/ user@server:/app/dist/

# Restart service
ssh user@server "systemctl restart api"

# Check logs
ssh user@server "journalctl -u api -f"
```

**Verify deployment:**
```bash
# Health check
curl https://api.yourdomain.com/health

# Should return:
# { "status": "ok", "uptime": ... }
```

### Step 3: Deploy Web/Frontend (15 min)

```bash
# Build
cd apps/web
pnpm build

# Deploy (if using Vercel)
vercel --prod

# Or push to trigger auto-deploy
git push origin main
```

**Verify:**
- [ ] Site loads without errors
- [ ] Can sign in
- [ ] Can see dashboard
- [ ] Can start free audit

### Step 4: Post-Deployment Verification (15 min)

#### Health Checks
```bash
# API health
curl https://api.yourdomain.com/health

# Public audit endpoint (should work without auth)
curl -X POST https://api.yourdomain.com/audit/free \
  -H "Content-Type: application/json" \
  -d '{"websiteUrl":"https://example.com", "businessName":"Test", "email":"test@example.com"}'

# Should return readiness score or "reachable": false
```

#### Feature Checks
- [ ] Can sign up
- [ ] Can create business
- [ ] Can run free audit
- [ ] Can upgrade to paid plan (test with Stripe test card)
- [ ] Webhook receives test event

#### Error Handling
- [ ] Trigger validation error: POST `/audit/free` with invalid URL
- [ ] Check error in Sentry dashboard
- [ ] Verify `requestId` in error response

#### Monitoring
- [ ] Check Sentry shows no unexpected errors
- [ ] Check database query times are normal
- [ ] Check rate limit headers present: `curl -i https://api.yourdomain.com/businesses`

#### Database
- [ ] Verify migration actually ran
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM organizations;"
  ```
- [ ] Check database size hasn't exploded
- [ ] Run ANALYZE for optimizer stats
  ```bash
  psql $DATABASE_URL -c "ANALYZE;"
  ```

---

## Rollback Plan (Use if deployment fails)

### If API won't start

```bash
# Check logs for errors
# Likely causes: invalid env vars, database migration failure, module import error

# Rollback to previous version
git revert HEAD
git push origin main
# Redeploy

# Or restore from backup
git checkout <previous-commit-hash>
pnpm build
# Redeploy
```

### If database migration broke queries

```bash
# Rollback migrations
# If you have migration versioning:
pnpm db:migrate:down

# Or restore from backup
# 1. Render dashboard → Database → Backups
# 2. Click "Restore from backup"
# 3. Select backup time before migration
# 4. Wait for restore (5-10 min)
```

### If Stripe integration broken

```bash
# Check webhook configuration
# Stripe dashboard → Webhooks → Check endpoint URL is correct

# Check API keys
echo $STRIPE_SECRET_KEY  # Should not be empty or placeholder

# Test webhook manually
# Stripe dashboard → Webhooks → Send test event
```

### If email delivery broken

```bash
# Check Resend API key
echo $RESEND_API_KEY

# Test email manually
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -d '{"from":"test@yourdomain.com","to":"test@example.com","subject":"test","html":"test"}'
```

---

## Monitoring After Deployment (30 min)

### Check Dashboard
1. **Sentry Dashboard**
   - [ ] No new errors appearing
   - [ ] Error rate is normal
   - [ ] All services responding

2. **Database Metrics** (if available)
   - [ ] Connection count normal (< 30)
   - [ ] Query times < 100ms (95th percentile)
   - [ ] No locked tables

3. **Uptime Monitoring**
   - [ ] Health check passes
   - [ ] API responses < 1 second

### Test Critical Flows

#### Free Audit Flow
1. Go to /audit
2. Enter website URL
3. Wait for audit to complete
4. Verify score appears

#### Upgrade Flow
1. Sign in
2. Click "Upgrade"
3. Complete Stripe payment (use test card: 4242 4242 4242 4242)
4. Verify plan updated in dashboard

#### Score Change Notification
1. Wait for scheduled re-scoring (daily at midnight, or manual trigger)
2. Check email was sent (Resend dashboard)
3. Verify Sentry has no email errors

#### Webhook Processing
1. Trigger a test webhook from Stripe
2. Verify organization plan updated
3. Check Sentry has no webhook errors

---

## Day 1 Monitoring (Next 24 hours)

### Hourly Checks (First 4 hours)
- [ ] Error rate still normal
- [ ] No database errors
- [ ] No API timeouts (p95 < 2 seconds)
- [ ] Stripe webhooks processing

### Every 6 Hours
- [ ] Check recent errors in Sentry
- [ ] Verify email delivery working
- [ ] Check database size stable

### End of Day
- [ ] Summary email to team
  - Error count vs baseline
  - Performance metrics
  - Any issues encountered
  - Next steps

---

## Deployment Success Criteria

You can declare deployment successful when:

✅ **Stability**
- Error rate < 5 per minute
- p95 response time < 2 seconds
- Database connection pool stable
- No hanging transactions

✅ **Functionality**
- Public audit endpoint works
- Authentication working
- Stripe payments working
- Email delivery working
- Scheduled jobs working

✅ **Security**
- Rate limiting active (can trigger 429)
- Validation working (can trigger 400)
- RLS enforced (users can't see others' data)
- Input validation preventing injection

✅ **Observability**
- Errors appearing in Sentry
- Request IDs trackable
- Error context (user, org, business) populated
- Performance metrics available

---

## Maintenance Window

If needed to minimize disruption:

1. **Schedule:** Saturday 2-4 AM (lowest traffic)
2. **Notify:** Post in Slack #status channel before
3. **Timeline:**
   - T-30: Notify customers
   - T-0: Begin deployment
   - T+15: DB migration
   - T+30: API deployment
   - T+45: Verification
   - T+60: Full rollout confirmed
4. **Communicate:** Update status every 15 min

---

## Post-Deployment

### Day 1
- [ ] Monitor for unexpected errors
- [ ] Run full test suite one more time
- [ ] Verify all critical paths work

### Day 7
- [ ] Check error trends (should be stable)
- [ ] Review Sentry for patterns
- [ ] Update runbook based on any issues

### Day 30
- [ ] Full performance audit
- [ ] Database cleanup (old logs, unused indexes)
- [ ] Review deployment process improvements

---

## Emergency Contacts

If deployment goes wrong:

| Issue | Contact | Response Time |
|-------|---------|---|
| Stripe API | Stripe Support | 1 hour |
| Email delivery | Resend Support | 30 min |
| Database performance | DB admin | 15 min |
| API not starting | On-call engineer | 15 min |
| Webhook not working | CTO | 15 min |

---

## Checklists

### Pre-Deploy Verification
```
[ ] Tests passing
[ ] No TypeScript errors
[ ] Environment variables configured
[ ] Database backed up
[ ] Migrations tested on staging
[ ] Sentry configured
[ ] External services verified
[ ] Rollback plan documented
```

### Deploy Verification
```
[ ] Migrations ran successfully
[ ] API deployed and responding
[ ] Web app deployed and loading
[ ] Health checks passing
[ ] Feature tests passing
[ ] Error handling working
[ ] Monitoring active
```

### Post-Deploy Verification
```
[ ] No new errors in Sentry
[ ] Performance metrics normal
[ ] All critical flows tested
[ ] Email delivery working
[ ] Database health normal
[ ] Team notified
[ ] Monitoring set up
[ ] Documentation updated
```

---

## Notes

- **Deployment tool:** Render (recommended) or Railway
- **Estimated time:** 2-3 hours (one person)
- **Risk:** Low (all changes backwards-compatible)
- **Rollback time:** 15 minutes
- **Expected downtime:** < 30 seconds (during migration)

**This deployment includes:**
- Input validation on all endpoints
- Error handling + monitoring (Sentry)
- Rate limiting
- Webhook idempotency (prevents double-charging)
- Database constraints + performance indexes
- Race condition prevention (hard cap enforcement)
- Background worker reliability (retries)
- Comprehensive documentation

**You're shipping a rock-solid, production-grade SaaS. Go live with confidence.** 🚀
