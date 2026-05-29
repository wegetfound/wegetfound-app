# wegetfound.ai — v1 Product Surface & Expansion Roadmap

---

## PART A — CURRENT v1 (factual, from code)

### 1. What v1 is

wegetfound.ai is a web-first SaaS that measures how visible a small business is across five AI answer engines — ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews — and surfaces a prioritized queue of fixes the owner can act on. The product has two surfaces: a public `/audit` page that runs a no-AI-cost on-site readiness check (crawler access, structured data, NAP, reviews) and captures an email; and an authenticated dashboard where logged-in users see a Findability Score (0–100), a per-engine breakdown, a score-history chart, a fix queue, and a live prompt tester. The multi-tenant data model (`organization_id` on every record, Supabase RLS as the tenant boundary) is in place from day one. Stripe fields exist in the schema but the billing flow is not wired in the current routes.

---

### 2. API Surface

File references: `apps/api/src/server.ts`, `apps/api/src/routes/`

| Method | Path | Auth? | Purpose |
|--------|------|-------|---------|
| GET | `/health` | No | Liveness check; returns status, methodology version, timestamp |
| POST | `/audit/free` | No | On-site AI-readiness audit (no AI engine calls); optionally captures lead email |
| GET | `/me` | Yes | Current user profile + active organization (name, plan) |
| GET | `/me/usage` | Yes | AI run counts, engine calls, estimated spend, daily cap, remaining runs |
| POST | `/businesses` | Yes | Create a business in the caller's org; auto-seeds default tracked prompts |
| GET | `/businesses` | Yes | List all businesses in the caller's active org |
| GET | `/businesses/:id` | Yes | Get a single business (org-ownership enforced) |
| GET | `/businesses/:id/score` | Yes | Latest Findability Score (404 if no audit run yet) |
| GET | `/businesses/:id/score/history` | Yes | Up to 100 historical scores, newest first |
| GET | `/businesses/:id/fixes` | Yes | Pending fix queue, sorted by priority descending |
| POST | `/businesses/:id/audit` | Yes | Trigger a fresh AI audit + re-score; enforces daily cap; synchronous in v1 |
| POST | `/businesses/:id/prompts/test` | Yes | Live prompt test across all engines; enforces daily cap; no DB write |
| POST | `/businesses/:id/prompts` | Yes | Save a tracked prompt |
| GET | `/businesses/:id/prompts` | Yes | List active tracked prompts, newest first |
| DELETE | `/prompts/:id` | Yes | Hard-delete a tracked prompt the caller owns |
| POST | `/fixes/:id/complete` | Yes | Mark a fix as completed |
| POST | `/fixes/:id/skip` | Yes | Mark a fix as skipped (tracked, not discarded) |

**Total: 17 routes** (2 public, 15 authenticated).

Routes present in `CLAUDE.md §9` but **not yet implemented** in the route files: organizations CRUD, `/businesses/:id/listings`, `/businesses/:id/schemas`, `/businesses/:id/reviews`, `/businesses/:id/competitors`, `/webhooks/stripe`, `/webhooks/supabase-auth`.

---

### 3. Dashboard Features

File references: `apps/web/src/App.tsx`, `apps/web/src/dashboard/Dashboard.tsx`, `apps/web/src/dashboard/PromptTester.tsx`, `apps/web/src/onboarding/Onboarding.tsx`, `apps/web/src/free-audit/FreeAudit.tsx`

- **`/audit` — Free public audit page**: takes a website URL + optional business name; calls `POST /audit/free`; displays an AI Readiness score (0–100), four signal bars (AI crawler access, structured data, business info, reviews), and up to three findings with estimated score impact and minutes. After results, shows an email capture form that re-submits to store the lead.
- **Login screen**: email-based Supabase Auth (magic link). No password UI present.
- **Onboarding flow (3 steps)**: welcome explainer (skippable) → how-it-works explainer (skippable) → business creation form (name, website URL, city, country, category). On submit, auto-triggers the first audit so the user sees a score immediately.
- **Business selector sidebar**: lists all businesses in the org; click to switch context.
- **Findability Score card**: large score ring (color-coded green/amber/red at 67/34 thresholds), prompts-winning / prompts-tested ratio, signal multiplier.
- **Per-engine breakdown**: horizontal bar chart for each of the five engines (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews), rendered only when sub-scores are present.
- **Score history chart**: SVG polyline chart of up to 100 historical overall scores, oldest-to-newest, with a delta label (e.g. "+12 pts"). Shows a placeholder message until at least two data points exist.
- **Fix queue**: list of pending fixes sorted by priority, each showing title, description, estimated score impact (+N pts), estimated minutes, Skip and Done buttons.
- **Prompt Tester**: free-text input; fires `POST /businesses/:id/prompts/test` against all five engines concurrently; shows per-engine status (Recommends you / Didn't mention you / Couldn't reach), answer excerpt (up to 320 chars), and citation links. "Add to tracked prompts" button saves the tested prompt. Tracked prompts list with Remove buttons.
- **Header**: org name + plan chip, user email, sign-out button.

---

### 4. Data Entities

File references: `packages/db/src/schema/`

| Table | What it represents |
|-------|-------------------|
| `users` | Supabase Auth mirror; stores email, full name, avatar, last active |
| `organizations` | Tenant boundary; holds plan, Stripe IDs, white-label fields |
| `organization_members` | Many-to-many join: user ↔ org with role (owner/admin/member/viewer) |
| `businesses` | Core entity; NAP master record, vertical, category, geo, hours, social profiles |
| `findability_scores` | Immutable score history; per-engine sub-scores, prompts tested/winning, signals JSONB, methodology version |
| `tracked_prompts` | Prompts a business monitors over time; soft-deleteable via `is_active` |
| `prompt_results` | One row per (prompt, engine, run); stores business mentioned bool, competitors JSONB, raw response, cache key |
| `fixes` | Prioritized action items; fix type, estimated impact and minutes, action payload JSONB, status lifecycle |
| `directory_listings` | NAP snapshot per directory (Google, Apple, Bing, Yelp, Facebook, TripAdvisor, Yellow Pages); match status vs. master record |
| `business_schemas` | JSON-LD records the system manages (LocalBusiness, FAQ, Service, etc.); tracks injection method and status |
| `events` | Internal event bus; every meaningful state change (score.updated, fix.completed, mention.gained/lost, audit.run, prompt.tested) |
| `feature_flags` + `organization_feature_flags` | Boolean feature toggles with per-org overrides; all v2 flags ship off |
| `leads` | Anonymous free-audit email captures; stores audit snapshot; no org FK |

---

### 5. The Funnel as Built

1. **Free public audit** (`POST /audit/free`, no auth, no AI cost): fetches the business's website and scores crawler accessibility, structured data completeness, NAP consistency, and review health. Returns a "readiness score" (weighted 40/40/20) and up to three findings filtered to `crawler_blocked`, `schema_missing`, `missing_faq`. Email capture stored in `leads`.
2. **Signup**: Supabase magic-link. On first login, user has no businesses; the onboarding flow fires.
3. **Onboarding**: user enters business details → `POST /businesses` → server auto-seeds default tracked prompts → dashboard auto-triggers `POST /businesses/:id/audit`.
4. **Authenticated full audit** (`POST /businesses/:id/audit`, auth required, AI cost): calls `scoreBusiness()`, which queries actual AI engines; checks and records against the daily cap (`isOverDailyCap` / `recordAiRun`); writes a `findability_scores` row and syncs the fix queue.
5. **Fix queue → re-score**: user completes or skips fixes; "Re-run audit" button triggers another full audit to refresh the score.

---

### 6. Cost & Rate-Limit Posture

File references: `packages/db/src/usage.ts`, `apps/api/src/routes/businesses.ts`, `apps/api/src/routes/prompts.ts`

- **Daily AI cap**: `MAX_AI_RUNS_PER_DAY` env var, defaulting to **25 runs/org/day**. Enforced at the start of `POST /businesses/:id/audit` and `POST /businesses/:id/prompts/test` via `isOverDailyCap()`. Cap breach returns HTTP 429.
- **Usage tracker**: every successful AI run writes an `audit.run` or `prompt.tested` event to the `events` table with `engineCalls` count in the payload (= `promptsTested × liveEngines.length` for audits, `results.length` for prompt tests).
- **`GET /me/usage`**: returns today + month run counts, summed engine calls, estimated cost (at `$0.01/engine-call` blended estimate), cap per day, and remaining runs today.
- **Endpoints that incur third-party API cost**: `POST /businesses/:id/audit` and `POST /businesses/:id/prompts/test`. The free audit (`POST /audit/free`) does **not** call AI engines.
- **Cap is org-level, not plan-level**: there is no per-plan differentiation in the current code; all orgs share the single env-var cap.

---

## PART B — PROPOSED EXPANSION

> **PROPOSED — needs founder sign-off.** Everything in Part B is recommendation, not shipped behavior.

---

### 7. Gaps That Block Growth

The following are absent from the current codebase and block converting early users into paying customers or scaling beyond a handful of manual users:

1. **No billing/paywall**: `organizations.plan` and Stripe fields exist in the schema but there is no Stripe Checkout, no webhook handler, no plan-gating middleware, and no upgrade prompt in the UI. All users are effectively on free indefinitely.
2. **No scheduled re-scoring**: scores only update when the user manually clicks "Re-run audit." The product's core promise (weekly tracking on Free, daily on Growth) is not implemented; there is no cron job or BullMQ worker.
3. **Daily cap is flat across all orgs/plans**: paid users get the same 25-run cap as free users. There is no per-plan cap differentiation.
4. **Fix queue is populated but not auto-refreshed post-fix**: completing a fix does not trigger a re-audit or score estimate update, so the score ring stays stale.
5. **NAP Fix-It, Schema Auto-Pilot, Review Coach, Competitor Ghost**: the DB tables and enums exist, but there are no routes, no adapters, and no UI for any of these four core v1 features (CLAUDE.md §3.4–3.7).
6. **No transactional email**: no welcome email, no weekly digest, no "your score changed" notification. Resend/Loops are listed in the stack but not wired.
7. **No mobile app**: React Native/Expo app directory exists in the monorepo plan but is not present in `apps/`.
8. **No marketing site**: the Astro marketing site app is referenced but not present; the free audit lives inside the web app at `/audit`, not on a separate domain.
9. **No org management UI**: users cannot rename their org, change plans, or view billing; the `/organizations` routes described in CLAUDE.md §9 are not implemented.
10. **Competitor detection is not surfaced**: the `competitor.detected` event type exists; `prompt_results.competitorsMentioned` is stored; but the UI only shows raw competitors in the prompt tester — there is no Competitor Ghost view.

---

### 8. Proposed Roadmap

> **PROPOSED — needs founder sign-off.**

#### Phase 1 — Make it sellable (4–6 weeks)

Goal: a user can pay, see recurring value, and tell someone else about it.

1. **Wire Stripe Checkout + plan gating** — Without this, there is no revenue. Add `POST /webhooks/stripe`, update `organization.plan` on subscription events, add plan-check middleware to cap-enforcement and fix-queue depth. Add upgrade prompt in the dashboard when a free-tier user hits the daily cap. *Rationale: zero revenue without this.*
2. **Scheduled re-scoring via BullMQ** — Add a `digest:weekly` job that runs `scoreBusiness()` for every active business on the Free plan weekly, daily for Growth/Agency. Store results + send a "your score changed" email via Resend. *Rationale: the product's core value proposition (tracking over time) only works if scores update without user action.*
3. **Per-plan cap differentiation** — Replace the flat `MAX_AI_RUNS_PER_DAY` env var with a plan lookup (Free: 3/day, Starter: 10/day, Growth: 30/day, Agency: unlimited). *Rationale: needed to enforce upgrade triggers and protect API spend.*

#### Phase 2 — Fill the v1 feature gaps (6–8 weeks)

Goal: deliver all seven CLAUDE.md §3 features so the product matches what was designed.

4. **NAP Fix-It** — Add a route + job that compares `businesses` master record against `directory_listings` snapshots and surfaces `nap_mismatch` fixes. Even read-only (no write API) with deep-link-out instructions covers the primary user value. *Rationale: NAP consistency is a top scoring signal and already modeled in the DB.*
5. **Schema Auto-Pilot (manual copy-paste path first)** — Generate JSON-LD for `LocalBusiness` + `FAQ` based on business data; display it in the dashboard with a "copy this to your site" instruction. The WordPress plugin can follow. *Rationale: schema completeness is a scored signal; users can act on it immediately without an API integration.*
6. **Transactional + lifecycle email** — Welcome email on signup, weekly score digest (score, top fix, "you improved X pts"), and "score dropped" alert. *Rationale: this is the retention mechanism that keeps users coming back without opening the app.*
7. **Competitor Ghost (display only)** — Surface `competitorsMentioned` from `prompt_results` in a simple view: "These businesses came up instead of you." No scoring required, data is already being collected. *Rationale: this is the described "aha moment" feature; data is already there.*

#### Phase 3 — Agency-readiness & moat (ongoing)

Goal: support Persona B and C, build defensibility.

8. **Multi-business org management** — `/organizations` routes, org switcher UI, invite flow. Required for Persona B ($149/mo) and Agency ($149+). *Rationale: the data model supports it; just needs UI and routes.*
9. **Reporting export (PDF/CSV)** — One-click "export this month's report" for each business. Needed for agency clients to show value to their own customers. *Rationale: low engineering cost, high perceived value for agency tier.*
10. **Vertical prompt packs** — Pre-seeded tracked prompts tuned per vertical (restaurant, hotel, tradie, wellness). Currently `buildDefaultPrompts()` is called but likely returns generic prompts. *Rationale: faster time-to-value for new signups; vertical-specific data compounds into the scoring moat.*

---

### 9. Open Questions for the Founder

1. **Pricing enforcement timing**: should plan limits be soft (warn but allow) or hard (block at cap) for the first paid cohort? Hard limits protect margin but may frustrate early adopters.
2. **Free-audit AI gate**: the free audit currently costs zero (no AI calls). Should a basic AI check be added to the free audit to improve the conversion moment, accepting the cost, or keep it free forever to protect top-of-funnel scale?
3. **Scheduled audit opt-in vs. opt-out**: should weekly/daily re-scoring be on by default for all plans, or should users explicitly enable tracking? Default-on increases API spend but is higher-value.
4. **NAP write APIs**: the `listings/sync` route is planned but directory write APIs have varying costs and reliability (GBP is free via Google API; others are not). Which directories get write support in v1 vs. deep-link-out only?
5. **Mobile app prioritization**: is mobile a v1 deliverable or a post-revenue initiative? The monorepo has a placeholder but no code. Delaying it until after billing ships likely makes sense for a solo founder.
6. **Methodology version bump**: `METHODOLOGY_VERSION` is imported from `@wegetfound/scoring` but the value was not confirmed in this read. What is the current version string, and is there a policy for when it increments?
