# Monitoring Setup — Sentry Integration

**Status:** ✅ Code ready, awaiting configuration

This guide shows how to set up Sentry for error tracking and monitoring.

## Why Sentry?

- **Error tracking** — Capture all unhandled errors automatically
- **Performance monitoring** — Track slow endpoints (p95, p99)
- **Error grouping** — Aggregate similar errors (10 "database connection" errors = 1 issue)
- **Alert on regressions** — New errors trigger alerts
- **Session replay** — See what users were doing when error happened (with PII controls)
- **Release tracking** — Know which deploy introduced the bug

## Setup (15 minutes)

### Step 1: Create Sentry Account

1. Go to https://sentry.io
2. Sign up (free tier available)
3. Create a new project:
   - Platform: **Node.js**
   - Framework: **Other**

### Step 2: Get DSN

From Sentry project settings, copy the **DSN** (Data Source Name):

```
https://examplePublicKey@o12345.ingest.sentry.io/67890
```

### Step 3: Set Environment Variable

Add to your `.env` or `.env.production`:

```bash
SENTRY_DSN=https://examplePublicKey@o12345.ingest.sentry.io/67890
```

### Step 4: Install Dependencies

```bash
cd apps/api
pnpm install
```

This installs `@sentry/node` and `@sentry/profiling-node`.

### Step 5: Verify

Start the server and trigger an error:

```bash
pnpm dev
```

Then in another terminal:

```bash
# Trigger a validation error
curl -X POST http://localhost:3001/audit/free \
  -H "Content-Type: application/json" \
  -d '{"websiteUrl": "invalid"}'
```

Check Sentry dashboard — you should see the error.

## What Gets Captured

### Automatically Captured

✅ Unhandled exceptions
✅ HTTP request details (method, URL, status code)
✅ Database errors
✅ API call failures
✅ Worker job failures
✅ Authentication errors
✅ Rate limit hits (warning level)

### Intentionally NOT Captured

❌ Health check endpoints (`/health`)
❌ Webhooks (sensitive data)
❌ Credentials/passwords
❌ Session tokens
❌ PII (user emails, in error context only)

## Configuration

### Error Sample Rate

In `apps/api/src/monitoring.ts`:

```typescript
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
```

- **Development:** 100% of errors captured
- **Production:** 10% sampled (cost reduction)

Adjust based on your error volume.

### Performance Tracing

```typescript
profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
```

- Captures slow function calls
- Shows where time is spent
- Default: 10% in production

### Environment

Set `NODE_ENV` to automatically categorize errors:

```bash
NODE_ENV=production pnpm start
```

- `development` — All errors captured, slow response times expected
- `production` — Real traffic, alerts triggered on regressions
- `staging` — Pre-production testing

## Monitoring Dashboard

### Key Metrics to Watch

1. **Error Rate** — Errors per minute
   - Alert if > 5 errors/min
   - Investigate immediately if > 50 errors/min

2. **Response Time** — p95 endpoint latency
   - `/audit/free` should be < 2 seconds (site load time)
   - `/businesses/:id/audit` should be < 5 seconds (AI scoring)
   - `/stripe/checkout-session` should be < 1 second

3. **Error by Endpoint**
   - `/stripe/checkout-session` failures → Stripe API issues
   - `/webhooks/stripe` failures → Webhook processing issues
   - `/audit/free` failures → Site reachability issues

### Alerts to Configure

1. **New Error Alert** (Immediate)
   - Trigger: First occurrence of new error
   - Action: Slack/email notification

2. **Error Rate Spike** (Critical)
   - Trigger: Error rate > 5x normal
   - Action: Page on-call engineer

3. **Slow Transaction** (Warning)
   - Trigger: p95 latency > 5 seconds
   - Action: Investigate query bottleneck

## Error Context

All errors include:

```json
{
  "user": { "id": "user-123" },
  "context": {
    "organization": { "id": "org-456" },
    "business": { "id": "business-789" }
  },
  "tags": {
    "method": "POST",
    "url": "/audit/free",
    "statusCode": 400
  }
}
```

This helps:
- Trace errors to specific organizations
- Debug customer issues faster
- Understand error patterns per tenant

## Rate Limiting Monitoring

Rate limit errors (`429`) are captured at **warning level** (not error):

```
⚠️ Too many requests from 192.168.1.1
```

This helps identify:
- Legitimate traffic spikes
- Potential attackers (sustained high request rate)
- Need to increase rate limits

## Email Delivery Monitoring

Resend API failures are logged:

```
❌ Failed to send email to user@example.com
⚠️ Resend API rate limit exceeded
```

Check Sentry to see:
- Email delivery success rate
- Which customers are affected by delivery failures
- When Resend service is degraded

## Database Error Monitoring

Database errors are captured but **sensitive details masked**:

```
❌ Database error
   Message: Unique constraint violation on (org_id, user_id)
   (NOT: password, full SQL, connection string)
```

This helps:
- Identify data integrity issues
- Spot race conditions (duplicate insert attempts)
- Monitor connection pool exhaustion

## On-Call Playbook

When Sentry alert fires:

### 1. Page Says: "Error rate spike"

```
→ Check Sentry dashboard
→ Click largest error group
→ Read most recent error
→ Check "Error history" tab — was this introduced recently?
→ If recent deploy: rollback or hotfix
→ If existing: investigate affected customer
```

### 2. Page Says: "New error"

```
→ Check if it's from a new endpoint or service
→ If new endpoint: likely a bug introduced in latest deploy
→ If existing code: investigate what triggered it (user input? Edge case?)
→ Check error context (which org/business was affected?)
→ Try to reproduce locally
```

### 3. Page Says: "Slow transaction"

```
→ Check which endpoint (audit, webhook, etc.)
→ Check slow transaction details (which database query?)
→ Check if it correlates with traffic spike
→ Check database connection pool status
→ Consider adding index or caching
```

## Cost Optimization

Sentry pricing based on:
- **Events:** Error + performance events (transactions)
- **Attachments:** Session replays, crash reports

### Save Money

1. **Sample in production** (already done: 10%)
2. **Ignore known errors**
   - Set `beforeSend()` to filter
   - E.g., ignore 404s from crawlers

3. **Don't capture health checks**
   - Already excluded in `monitoring.ts`

4. **Limit attachments**
   - Disable session replay for large user bases

## Troubleshooting

### Sentry not capturing errors

**Check:**
1. Is `SENTRY_DSN` set and valid?
2. Is server running (check `[monitoring] Sentry initialized` log)?
3. Is error happening in try-catch block? (Must throw to be captured)

**Test:**
```bash
curl http://localhost:3001/audit/free -d '{"websiteUrl": "invalid"}' -H "Content-Type: application/json"
```

### Too many errors captured

**Solution:** Increase `tracesSampleRate` (capture fewer)
```typescript
tracesSampleRate: 0.01  // Only 1% in production
```

### Missing user context

**Check:** Is error happening before auth? (Unauthenticated endpoints won't have userId)

### Sensitive data in errors

**Report to Sentry:** https://github.com/getsentry/sentry-javascript/issues

Don't ship sensitive data in error messages!

## Environment Variables

Add to `.env`:

```bash
# Sentry
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project

# Monitoring
NODE_ENV=development
```

Add to `.env.production`:

```bash
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project
NODE_ENV=production
```

## Reference Links

- **Sentry Docs:** https://docs.sentry.io/platforms/node/
- **Error Context:** https://docs.sentry.io/platforms/node/enriching-events/context/
- **Alerts:** https://docs.sentry.io/product/alerts/
- **Releases:** https://docs.sentry.io/product/releases/

## What's Ready

✅ Code integrated (`monitoring.ts`)
✅ Error capture configured
✅ Performance tracing enabled
✅ Environment setup
✅ Fastify integration

## Next Steps

1. Create Sentry account (free tier)
2. Copy DSN
3. Set `SENTRY_DSN` env var
4. Deploy
5. Trigger test error to verify
6. Configure alerts in Sentry dashboard
7. Add to on-call playbook

---

**Total setup time: 15 minutes**
**Value: See every error + performance issue automatically**
