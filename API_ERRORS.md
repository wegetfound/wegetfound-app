# API Error Reference

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "req-abc123",
  "context": { ... }  // (optional) Additional context
}
```

## Error Codes

### 400 — VALIDATION_ERROR

**Cause:** Request input is invalid (format, length, type)

**Examples:**
```json
{ "error": "URL exceeds max length (2048)", "code": "VALIDATION_ERROR" }
{ "error": "Email must be a string", "code": "VALIDATION_ERROR" }
{ "error": "Invalid URL format", "code": "VALIDATION_ERROR" }
{ "error": "name must be at least 1 character(s)", "code": "VALIDATION_ERROR" }
```

**What to do:**
1. Check request body matches expected types
2. Check string lengths (URL max 2048, email max 254, name max 200, etc.)
3. Check URLs start with `http://` or `https://`
4. Check emails are valid format

**Endpoint examples:**
- POST `/audit/free` with invalid URL
- POST `/businesses` with name too long
- GET `/businesses/:id` with malformed UUID

---

### 401 — UNAUTHORIZED

**Cause:** Missing or invalid authentication token

**Examples:**
```json
{ "error": "Missing bearer token", "code": "UNAUTHORIZED" }
{ "error": "Invalid token", "code": "UNAUTHORIZED" }
{ "error": "Token missing subject", "code": "UNAUTHORIZED" }
```

**What to do:**
1. Verify `Authorization: Bearer <token>` header is set
2. Verify token is from Supabase auth
3. Verify token hasn't expired
4. Get new token by signing in again

**Applies to:** All authenticated endpoints (everything except `/audit/free`)

---

### 403 — FORBIDDEN

**Cause:** User is authenticated but not authorized for this resource

**Examples:**
```json
{ "error": "Not a member of the requested organization", "code": "FORBIDDEN" }
```

**What to do:**
1. Check you're using correct `X-Org-Id` header (if multi-org user)
2. Verify you belong to the organization
3. Ask org admin to add you as member

**Applies to:** Any endpoint where you access org data you don't belong to

---

### 404 — NOT_FOUND

**Cause:** Resource doesn't exist or belongs to different organization

**Examples:**
```json
{ "error": "Business not found", "code": "NOT_FOUND" }
{ "error": "Organization not found", "code": "NOT_FOUND" }
{ "error": "Fix not found", "code": "NOT_FOUND" }
```

**What to do:**
1. Verify resource ID exists
2. Verify you're accessing your own organization's resources
3. Check if resource was recently deleted

**Applies to:** Any GET/POST endpoint with `:id` parameter

---

### 409 — CONFLICT

**Cause:** Request conflicts with existing data (duplicate, constraint violation)

**Examples:**
```json
{ "error": "Organization already exists with this name", "code": "CONFLICT" }
{ "error": "Business with this URL already tracked", "code": "CONFLICT" }
```

**What to do:**
1. Check if you're creating a duplicate
2. Use existing resource instead of creating new
3. Delete old resource and retry

**Applies to:** POST endpoints that create resources

---

### 429 — RATE_LIMIT

**Cause:** Too many requests from your IP/user account

**Examples:**
```json
{ "error": "Too many requests. Try again in 45 second(s).", "code": "RATE_LIMIT" }
{ "error": "Daily audit limit reached (3/day). Try again tomorrow.", "code": "RATE_LIMIT" }
```

**What to do:**
1. Wait for `Retry-After` seconds before retrying
2. If hitting daily audit limit:
   - Check your plan (free = 3/day)
   - Upgrade plan to increase limit
   - Retry tomorrow (limit resets at midnight UTC)

**Rate limits:**
- Public `/audit/free`: 5 per minute per IP
- Authenticated endpoints: 60 per minute per user
- Daily AI audits: depends on plan
  - Free: 3/day
  - Starter: 10/day
  - Growth: 30/day
  - Agency: unlimited

---

### 502 — EXTERNAL_SERVICE_ERROR

**Cause:** External API call failed (Stripe, Resend, Perplexity, etc.)

**Examples:**
```json
{ "error": "Stripe API error: Invalid API key", "code": "EXTERNAL_SERVICE_ERROR" }
{ "error": "Failed to send email", "code": "EXTERNAL_SERVICE_ERROR" }
{ "error": "AI engine unavailable", "code": "EXTERNAL_SERVICE_ERROR" }
```

**What to do:**
1. Retry the request (these are usually transient)
2. If persists, check service status page
3. Contact support with request ID

**Services we depend on:**
- Stripe (payments)
- Resend (email)
- Perplexity/OpenAI (AI search)
- Google Maps (business data)

---

### 503 — SERVICE_UNAVAILABLE

**Cause:** Our service is down or not configured yet

**Examples:**
```json
{ "error": "Stripe not configured yet", "code": "SERVICE_UNAVAILABLE", "message": "Stripe account setup in progress. Please try again in a few days." }
```

**What to do:**
1. Wait a few minutes and retry
2. Check status page: https://status.wegetfound.com
3. Contact support if it persists

---

### 500 — INTERNAL_ERROR

**Cause:** Unexpected server error (bug)

**Examples:**
```json
{ "error": "An error occurred processing your request", "code": "INTERNAL_ERROR" }
```

**What to do:**
1. Note the `requestId` from response
2. Try again in 30 seconds
3. Contact support with requestId and what you were doing
4. Error is automatically reported to our team (via Sentry)

---

## Common Scenarios

### I can't log in

**Check:**
1. Is your email correct?
2. Did you click the sign-up link in email?
3. Try password reset: https://app.wegetfound.com/auth/reset-password

**If still failing:**
- You'll get `401 UNAUTHORIZED` on any authenticated endpoint
- Contact support with your email address

### I'm seeing "Daily limit reached"

**Your plan:**
- Free: 3 audits/day
- Starter: 10 audits/day
- Growth: 30 audits/day
- Agency: unlimited

**To get more:**
1. Upgrade your plan in settings
2. Wait until tomorrow (limit resets at midnight UTC)
3. Ask your admin to use their quota

### I'm seeing validation errors

**Most common:**
- URL too long (max 2048 chars)
- Email invalid format
- Business name too long (max 200 chars)
- UUID format invalid in URL

**Fix:**
1. Shorten input strings
2. Check URLs are valid (start with http:// or https://)
3. Check emails are valid (user@domain.com)
4. Check UUIDs in URLs are correct

### Stripe/Payment Error

**Common errors:**
- "Invalid plan" — Plan doesn't exist (use: starter, growth, agency)
- "Stripe not configured yet" — Account setup in progress
- "Invalid API key" — Stripe account not activated

**To fix:**
1. Contact support to verify Stripe account is set up
2. Check plan name is correct
3. Try again in a few hours

### Email delivery failed

**Causes:**
- Email address is invalid
- Email service (Resend) is down
- Too many emails sent (rate limited by email service)

**To check:**
1. Verify email address is correct in settings
2. Check spam folder
3. Wait a few minutes and retry

## Retry Strategy

### Which errors to retry?

**Always safe to retry (idempotent):**
- `429 RATE_LIMIT` (after waiting `Retry-After` seconds)
- `502 EXTERNAL_SERVICE_ERROR` (transient API failure)
- `503 SERVICE_UNAVAILABLE` (temporary downtime)

**Never retry (will fail again):**
- `400 VALIDATION_ERROR` (fix input first)
- `401 UNAUTHORIZED` (get new token first)
- `403 FORBIDDEN` (get permission first)
- `404 NOT_FOUND` (resource doesn't exist)
- `409 CONFLICT` (delete duplicate first)

### Recommended retry logic

```javascript
async function makeRequest(url, options) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(data.error);
      }

      // Server error or rate limit: retry with backoff
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers['Retry-After'] || Math.pow(2, attempt);
        if (attempt < maxRetries) {
          console.log(`Retry attempt ${attempt}/${maxRetries}, waiting ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          continue;
        }
      }

      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
```

## Request ID Tracking

Every error response includes a `requestId`. Use this to:

1. **Track in logs:** Find error context on server
2. **Support tickets:** Include in bug reports
3. **Performance debugging:** Correlate with other logs

**Example:**
```
You: "My audit failed"
Support: "What's the requestId?"
You: "req-abc123"
Support: "Found it! The issue was... [context from logs]"
```

## Error Monitoring

All errors are automatically captured in our monitoring system (Sentry):

- **Your error happens**
- **Error is sent to Sentry**
- **Sentry groups similar errors**
- **Our team gets alerted**
- **We investigate and fix**

To help us fix errors faster:

1. Include the `requestId` in bug reports
2. Tell us what you were doing when error happened
3. Tell us your plan type (free/starter/growth)
4. Check if it's reproducible

## Support

For errors not listed here:

1. Check the error message carefully (it's usually descriptive)
2. Check `requestId` in Sentry dashboard
3. Contact support: support@wegetfound.com

Include:
- Error code
- Error message
- Request ID
- What you were trying to do
- Your plan type
