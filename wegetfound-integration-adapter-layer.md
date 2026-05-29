# Integration & Adapter Layer — as-built spec

**Scope:** everything that ingests external / on-site signals about a business and turns them into actionable fixes. Specifically: fetching a business's website, analysing its on-site signals (robots.txt, JSON-LD, NAP), and reconciling the resulting findings into the fix queue. This layer is distinct from the AI-adapter layer (`packages/ai-adapters/`), which queries ChatGPT, Perplexity, Claude, Gemini, and Google AIO. The AI layer asks "does this business appear in engine responses?" The integration/adapter layer asks "what does the business's own web presence expose for AI engines to read?"

---

## 1. The on-site audit — `auditBusiness`

**Entry point:** `packages/audit/src/audit.ts` → `auditBusiness(business: BusinessAuditInput, fetchImpl?)`

The function accepts a `BusinessAuditInput` (name, websiteUrl, phone, addressLine1, city, postalCode) and an optional injected `fetchImpl` (defaults to `fetchSite` — used in tests to supply a fake fetch without hitting the network).

### 1.1 Fetch phase — `fetchSite`

`packages/audit/src/fetch-site.ts`

- Issues an HTTP GET to the business website with `User-Agent: wegetfound-audit/1.0 (+https://wegetfound.ai)` and a 12-second `AbortController` timeout.
- Follows redirects; records `finalUrl` (the post-redirect destination).
- Then fetches `${origin}/robots.txt`; a missing or non-2xx robots.txt is treated as `null` (nothing blocked), not as an error.
- Returns `SiteFetch { ok, status, finalUrl, html, robotsTxt, error? }`.
- A network failure or timeout sets `ok: false` and stores the first line of the error. The audit continues rather than throwing — an unreachable site is itself a finding.

### 1.2 Crawler accessibility signal — `analyzeCrawlerAccess`

`packages/audit/src/crawler.ts` → `analyzeCrawlerAccess(robotsTxt: string | null): CrawlerAnalysis`

Checks seven named AI bots against the parsed robots.txt:

```
GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, CCBot
```

Parsing: groups directives by user-agent (lowercased). A bot is considered blocked if its specific group (or the `*` wildcard) disallows `/` with no overriding `Allow: /`. Only root-path blocks count; sub-path disallows do not trigger the finding.

**Score:** `(AI_BOTS.length − blockedBots.length) / AI_BOTS.length` → 0..1.  
Missing or empty robots.txt → `score: 1, hadRobotsTxt: false` (desired state, no penalty).

Returned fields: `score`, `blockedBots: string[]`, `hadRobotsTxt: boolean`.

### 1.3 Schema completeness signal — `analyzeSchema`

`packages/audit/src/schema.ts` → `analyzeSchema(html: string): SchemaAnalysis`

Uses Cheerio to extract every `<script type="application/ld+json">` block. Walks the parsed JSON, handling arrays and `@graph` containers. Malformed JSON is silently skipped.

Detects four boolean flags:

| Flag | What triggers it |
|---|---|
| `hasLocalBusiness` | `@type` matches any of: LocalBusiness, Organization, Restaurant, Hotel, Store, ProfessionalService, HomeAndConstructionBusiness, GeneralContractor, RealEstateAgent, HealthAndBeautyBusiness, LodgingBusiness |
| `hasFaq` | `@type` is FAQPage or Question |
| `hasReview` | `@type` is Review or AggregateRating, or the node has an `aggregateRating` key |
| `hasService` (local only) | `@type` is Service, or node has `makesOffer` or `hasOfferCatalog` |

**Score formula:**

```
score = (hasLocalBusiness ? 0.4 : 0)
      + (hasFaq           ? 0.2 : 0)
      + (hasService        ? 0.2 : 0)
      + (hasReview         ? 0.2 : 0)
// capped at 1.0
```

NAP extraction from the best LocalBusiness node: `name` → `ExtractedNap.name`, `telephone` → `phone`, `address.streetAddress` → `streetAddress`, `address.addressLocality` → `city`, `address.postalCode` → `postalCode`.

Returned fields: `score`, `foundTypes: string[]`, `hasLocalBusiness`, `hasFaq`, `hasReview`, `extractedNap`.

### 1.4 NAP consistency signal — `analyzeNap`

`packages/audit/src/nap.ts` → `analyzeNap(extracted: ExtractedNap, db: BusinessAuditInput): NapAnalysis`

Compares what the site's JSON-LD exposes against the business master record. Three fields are checked when both sides have data:

| Field | Normalisation | Major mismatch? |
|---|---|---|
| `name` | lowercase, strip LLC/Ltd/Inc/Co/The/punctuation; also handles Thai Unicode range | Yes — a name mismatch sets `hasMajorMismatch: true` |
| `phone` | last 9 digits only (tolerates country/trunk prefix differences: `+66922864775` === `0922864775`) | No |
| `postalCode` | strip whitespace | No |

**Score:** `matched / checked`. If neither side has comparable data, score is `0.5` (ambiguous). If the site exposes no machine-readable NAP at all, `noDataOnSite: true`, score `0`.

Returned fields: `score`, `hasMajorMismatch`, `mismatches: string[]`, `noDataOnSite`.

### 1.5 Review health signal

Computed inline in `auditBusiness`: `reviewHealth = schema.hasReview ? 0.5 : 0`. This is a v1 proxy — a site that has AggregateRating or Review markup scores 0.5; otherwise 0. There is no live review API call in the on-site audit path.

### 1.6 `fetched` flag

If `business.websiteUrl` is absent, `fetched: false` is returned immediately with all signals at 0. If `fetchSite` returns `ok: false` (unreachable or non-2xx), `fetched: false` is set and only a single `listing_update` finding is emitted; subsequent signal computations are skipped.

### 1.7 `AuditResult` shape

```typescript
{
  signals: Signals;           // four 0..1 values + hasMajorNapMismatch boolean
  findings: Finding[];
  fetched: boolean;
  finalUrl: string;
  foundSchemaTypes: string[]; // raw @type values encountered
  detail: {
    crawler: CrawlerAnalysis;
    schema: SchemaAnalysis;
    nap: NapAnalysis;
  };
}
```

---

## 2. Findings

`packages/audit/src/types.ts` — `Finding` interface:

| Field | Type | Purpose |
|---|---|---|
| `dedupKey` | `string` | Stable identity for reconciling the fix queue across re-audits |
| `fixType` | `FixType` | Classifies the finding (see below) |
| `title` | `string` | Plain-language headline (no jargon) |
| `detail` | `string` | One or two sentences explaining the impact |
| `estimatedScoreImpact` | `number` | Rough 1–100 score gain; drives fix-queue priority |
| `estimatedMinutes` | `number` | Effort to resolve; quick wins surface first |

### 2.1 All `FixType` values

Defined in `packages/shared/src/enums.ts`:

| Value | Emitted by |
|---|---|
| `schema_missing` | `auditBusiness` — no LocalBusiness-type node found |
| `missing_faq` | `auditBusiness` — no FAQPage/Question node found |
| `nap_mismatch` | `auditBusiness` — `nap.hasMajorMismatch` is true |
| `crawler_blocked` | `auditBusiness` — one or more AI bots blocked in robots.txt |
| `listing_update` | `auditBusiness` — site unreachable, or no website on record |
| `content_gap` | `contentGapFinding()` in `fixes-plan.ts` — business not mentioned for a tracked prompt |
| `review_request` | Enum-only in v1; not yet emitted by any audit code path |
| `review_response` | Enum-only in v1; not yet emitted by any audit code path |

### 2.2 Priority formula

`packages/audit/src/fixes-plan.ts` → `computePriority(finding)`:

```
priority = clamp(round(estimatedScoreImpact × 2 − estimatedMinutes / 3), 1, 100)
```

High impact + low effort rises to the top (crawler_blocked: impact 35, minutes 10 → priority ~67; missing_faq: impact 15, minutes 45 → priority ~15).

### 2.3 Content-gap findings

`contentGapFinding(promptText)` produces a `content_gap` finding with:
- `dedupKey`: `content_gap:${promptText.toLowerCase().trim()}`
- `estimatedScoreImpact: 20`, `estimatedMinutes: 60`
- Title/detail in plain language referencing the exact prompt text.

---

## 3. Free audit vs full audit

### 3.1 Free audit — `POST /audit/free`

`apps/api/src/routes/audit.ts`

Public, no auth. Accepts `{ websiteUrl, businessName?, email? }`. Runs `auditBusiness` (on-site signals only — **no AI engine calls**). Returns:

- `reachable: boolean` — if false, only `websiteUrl` and `businessName` are returned.
- `readinessScore: number` — a 0–100 composite: `(crawlerAccessibility × 0.4 + schemaCompleteness × 0.4 + reviewHealth × 0.2) × 100`. This is NOT the Findability Score (which requires AI engine queries).
- `signals` — the four raw 0..1 values.
- `findings` — filtered to `TEASER_FIX_TYPES = { crawler_blocked, schema_missing, missing_faq }`. The `nap_mismatch`, `listing_update`, and `content_gap` fix types are suppressed from the free response. The `dedupKey` field is also stripped from each finding in the response.
- `leadCaptured: boolean`.

### 3.2 Full audit — authenticated

Triggered by `POST /businesses/:id/audit` (route not yet implemented in the files reviewed; the audit package is ready, the route is a known gap — see section 8). The authenticated path would run the full `auditBusiness`, feed signals into the scoring engine (which also incorporates AI engine sub-scores), and call `syncFixesForBusiness`.

---

## 4. Findings → fix queue — `syncFixesForBusiness`

`packages/db/src/fixes-sync.ts`

Reconciles a fresh `Finding[]` from `auditBusiness` with the existing rows in the `fixes` table for the business. Two-step process:

**Step 1 — load current state:**
- Queries all rows for the business.
- Splits them into `existing` (status `pending` — plannable) and `resolvedKeys` (status `completed`, `skipped`, or `dismissed` — never resurrected).
- The `dedupKey` is recovered from `actionPayload.dedupKey`; falls back to `fixType` if absent.

**Step 2 — apply `diffFixes` plan:**

`packages/audit/src/fixes-plan.ts` → `diffFixes(existing, findings, resolvedKeys)`:

| Outcome | Condition |
|---|---|
| **create** | Finding has no matching pending fix and is not in `resolvedKeys` |
| **update** | Finding matches a pending fix by `dedupKey` (refreshes priority, impact, copy) |
| **remove** | Pending fix's `dedupKey` is not in the current findings (problem resolved) |

`syncFixesForBusiness` then executes inserts, updates, and deletes against the DB. New rows are inserted with `status: 'pending'` (the Drizzle default). Returns `{ created, updated, removed }`.

---

## 5. Data model

### 5.1 `fixes` table

`packages/db/src/schema/fixes.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses | cascade delete |
| `fix_type` | text (FixType) | |
| `priority` | integer | 1–100, higher surfaces first |
| `estimated_score_impact` | integer | nullable |
| `estimated_minutes` | integer | nullable |
| `title` | text | plain-language headline |
| `description` | text | plain-language detail |
| `action_payload` | jsonb | stores `{ dedupKey }` for reconciliation; v2 will carry structured action data |
| `status` | text (FixStatus) | default `pending`; allowed: `pending`, `completed`, `skipped`, `dismissed` |
| `completed_at` | timestamptz | set on transition to `completed`; null otherwise |
| `created_at` | timestamptz | |

### 5.2 `directory_listings` table

`packages/db/src/schema/listings.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses | cascade delete |
| `directory_id` | text (DirectoryId) | one of: `google_business`, `apple_business`, `bing_places`, `yelp`, `facebook`, `tripadvisor`, `yellow_pages` |
| `external_id` | text | listing ID in the third-party directory; nullable |
| `listing_name` | text | snapshot of what the directory shows |
| `listing_address` | text | |
| `listing_phone` | text | |
| `listing_hours` | jsonb | |
| `match_status` | text (MatchStatus) | `match`, `minor_mismatch`, `major_mismatch`, `missing` |
| `last_checked_at` | timestamptz | nullable |
| `created_at` | timestamptz | |

### 5.3 `business_schemas` table

`packages/db/src/schema/schemas.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `business_id` | uuid FK → businesses | cascade delete |
| `schema_type` | text (SchemaType) | `LocalBusiness`, `Organization`, `Service`, `FAQ`, `Review`, `Product`, `Article` |
| `jsonld_content` | jsonb | wegetfound is the source of truth; propagates to the user's site |
| `status` | text (SchemaStatus) | `draft`, `published`, `outdated` |
| `injected_via` | text | `wordpress_plugin`, `shopify_app`, `manual`, etc.; nullable |
| `injected_at` | timestamptz | nullable |
| `created_at` / `updated_at` | timestamptz | |

### 5.4 `leads` table

`packages/db/src/schema/leads.ts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text | nullable — capture can happen before email is entered |
| `website_url` | text | required; the URL that was audited |
| `business_name` | text | nullable |
| `audit_snapshot` | jsonb | `{ signals, readinessScore, findings }` — the TEASER_FIX_TYPES-filtered result |
| `created_at` | timestamptz | |

No `organization_id` — leads exist before signup. The table is written only via the service role (comment in schema file); the anon Supabase key has no RLS policy covering it (deny-by-default).

---

## 6. Lead capture

In `POST /audit/free`, if `email` is non-empty after trimming, a row is inserted into `leads` with:
- `email`, `websiteUrl`, `businessName` from the request body.
- `auditSnapshot` set to `{ signals, readinessScore, findings: filteredFindings }` — the same filtered payload returned to the caller.

`leadCaptured: true` is returned in the response so the frontend can suppress the email-capture form.

---

## 7. Fix-queue HTTP endpoints

`apps/api/src/routes/fixes.ts` — two authenticated endpoints:

- `POST /fixes/:id/complete` — sets `status = 'completed'`, `completed_at = now()`.
- `POST /fixes/:id/skip` — sets `status = 'skipped'`, `completed_at = null`.

Both verify ownership by joining the fix to its business's `organization_id` and comparing against `req.auth.orgId`. A fix belonging to another org returns 404 (not 403) to avoid enumeration.

---

## 8. Known gaps and TODOs

### 8.1 Directory integrations are schema-only placeholders

The `directory_listings` table, `DirectoryId` enum, and `MatchStatus` enum are fully defined, but there is no implemented adapter that actually reads from Google Business Profile, Apple Business Connect, Bing Places, Yelp, Facebook, TripAdvisor, or Yellow Pages. No API client, no fetch logic, no sync route exists in the reviewed code. The `GET /businesses/:id/listings` and `POST /businesses/:id/listings/sync` endpoints defined in CLAUDE.md §9.2 are not present in `apps/api/src/routes/`.

### 8.2 Review health is a weak proxy

`reviewHealth` is `schema.hasReview ? 0.5 : 0` — purely based on whether the site has AggregateRating or Review JSON-LD. No live review pull from Google, Yelp, or Facebook exists yet. The `review_request` and `review_response` FixType values are defined in the enum but are never emitted by any audit code.

### 8.3 Authenticated full audit route is absent

`POST /businesses/:id/audit` is specified in CLAUDE.md §9.2 but there is no route file implementing it. The audit package is ready; the wiring to the authenticated business context, BullMQ job queue, and `syncFixesForBusiness` call has not been built.

### 8.4 Schema injection is unimplemented

The `business_schemas` table exists. There are no implemented injection adapters (WordPress plugin, Shopify app, manual) and no `POST /businesses/:id/schemas/inject` route.

### 8.5 `napConsistency` in the free audit response is read-only informational

The free audit computes `nap.score` against the master record fields in `BusinessAuditInput`. With only `businessName` passed at the free-audit call site, no phone or postal code is available for comparison. The signal is present in the response but will always reflect an incomplete comparison unless the caller provides the full NAP.

### 8.6 `content_gap` findings are not generated by the audit package at the HTTP layer

`contentGapFinding()` exists in `fixes-plan.ts` but is not called from any route. It would need to be invoked after AI engine prompt results are stored and compared, which depends on the authenticated audit job not yet implemented.

### 8.7 Hardcoded readiness-score weights in the free audit

The composite `readinessScore` in `POST /audit/free` uses hardcoded weights: `crawlerAccessibility × 0.4 + schemaCompleteness × 0.4 + reviewHealth × 0.2`. These are not versioned and not derived from the scoring package's methodology version system.
