# CLAUDE.md — wegetfound.ai

> **First-run directive for any engineering agent (Claude Code, Cursor, contractor, future maintainer):**
>
> Read this file completely before doing anything. After reading, confirm you understand:
> 1. **The seven core features** (Section 3)
> 2. **The multi-tenant architecture** (Section 6.3 — `organization_id` on every record, never assume one-user-one-business)
> 3. **The web-first / no-IAP rule** (Section 11 — web app is the product, Stripe on web, mobile never mentions price, no Apple In-App Purchase ever)
> 4. **The plain-language copy rule** (Section 5 — banned jargon, centralized copy file, Persona A test)
> 5. **The adapter pattern for AI engines** (Section 6.4 — business logic never imports a specific adapter; everything goes through `engineRegistry`)
>
> Do not begin implementation until you have confirmed these five. Then begin **Section 12, Week 1: Foundation** — monorepo setup, Supabase project, database schema + migrations, API skeleton, Stripe test mode. After each week's work, summarize what shipped and what's next.
>
> This project is standalone. Ignore any global CLAUDE.md or external memory — this file is the only source of truth.

---

# wegetfound.ai — Engineering Instruction Set

**Document version:** 1.0
**Last updated:** May 24, 2026
**Status:** Source of truth. Any engineering decision that contradicts this document requires explicit founder approval.

---

## 0. How To Use This Document

This document is the single source of truth for building wegetfound.ai. Any engineering agent — Claude Code, Cursor, contractor, or future maintainer — executes against this document. If something is unclear, the answer is to ask the founder, not to guess.

The document is structured for top-down reading on first pass and section-jumping on subsequent reads. Each section is self-contained. The "Do This / Never Do This" section at the end is the enforcement layer.

---

## 1. Product Brief

**Product name:** wegetfound.ai
**One-line pitch:** A personal AI visibility coach that helps small businesses get recommended by ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews.
**Tagline:** "We get found."

**The problem.** 45% of consumers now use AI tools to find local businesses, but ChatGPT recommends just 1.2% of all local business locations. Most small businesses are invisible to AI search and don't know it. Existing tools (Profound, Semrush, KIME, Otterly) are built for marketing departments at $79–$499/month with technical dashboards. Nobody is serving the solo operator who runs a plumbing business, a yoga studio, a boutique hotel, or a niche service business and wants their business to be the one AI recommends.

**The solution.** A mobile-first, plain-language coaching product that runs weekly visibility audits, shows a single Findability Score (0–100), and delivers a daily fix the user completes in under 10 minutes. Behavior change product, not surveillance dashboard.

**The model.** Web-first SaaS following Notion / Slack / Figma pattern. Web app is the product, payment happens via Stripe on web, mobile apps are free companions for daily use. No Apple In-App Purchase, ever.

**The moat.** Proprietary Findability Score methodology, multi-tenant data foundation that compounds across thousands of businesses, plain-language coaching experience that competitors can't easily copy, vertical specialization roadmap that protects against horizontal players.

---

## 2. Target Personas

Build for Persona A first. Always. If a feature serves Persona B or C but hurts Persona A, it doesn't ship.

### Persona A — The Solo Operator (PRIMARY)

- Owns and operates one business: yoga studio, plumber, café, boutique hotel, off-grid land consultant, dentist, hair salon, accountant
- 35–55 years old
- Manages own marketing because they have to
- Has heard "AI search is changing things" but doesn't know what to do
- Phone-first user, opens a laptop maybe once a week
- Will pay $19–49/month for something visibly working
- Will cancel anything that takes more than 10 minutes a week
- Speaks no SEO jargon, doesn't know what schema is, doesn't care
- Wants outcomes, not data

### Persona B — The Side-Hustle Marketer

- Manages 2–5 small businesses (own + friends/family)
- Wants multi-business access
- Will pay $149/month
- More technical than Persona A but still not an SEO professional

### Persona C — The Local Agency

- 10–50 clients
- Wants white-label, API, bulk operations, client-facing reports
- Will pay $499–999/month
- Most technical; will tolerate complexity in exchange for power

**Design rule:** Every screen, every feature, every line of copy passes the Persona A test first. If a 50-year-old café owner in their kitchen at 9pm with reading glasses on can't understand it in 5 seconds, redesign it.

---

## 3. The Seven Core Features (v1 Scope)

Anything not on this list is v2. Do not build it in v1. Do not let scope creep happen.

### 3.1 The Findability Score

A single number, 0–100, representing how visible the business is across the 5 AI engines.

- Updated weekly on Free, Daily on Growth, real-time on Agency tier
- Shown on the home screen, large and prominent — this IS the home screen
- Score history charted: weekly trend, monthly trend, all-time
- Per-engine breakdown available one tap below the main score (ChatGPT 42, Perplexity 28, Claude 67, Gemini 51, Google AIO 19)
- Proprietary versioned methodology, NOT a raw API output (see Section 8)

### 3.2 The Daily Fix

One prioritized action per day. Takes 2–10 minutes. Completed inside the app.

- Surfaced on home screen below the score
- Fix types: schema updates, NAP corrections, missing FAQ content, review responses, content gaps, listing updates
- Each fix shows: what it is in plain language, why it matters, the expected score impact, the one-tap action
- Skip allowed but tracked (we learn what users avoid)
- Completion triggers a celebration micro-animation and updates the score (or estimates the next score)

### 3.3 Live AI Prompt Testing

User types a question their customer might ask an AI, the system queries all 5 engines, returns:

- Whether the business appears in each engine's response
- Who DOES appear (3 competitor names with brief context)
- A "why they win" analysis with 1–3 specific signals the competitor has that the user doesn't
- "Add to tracked prompts" button — track this prompt going forward

This is the "aha moment" feature that converts free to paid.

### 3.4 The NAP Fix-It

Name, Address, Phone monitoring across the major directories.

- v1 directories: Google Business Profile, Apple Business Connect, Bing Places, Yelp, Facebook, TripAdvisor, Yellow Pages
- Visual map of all listings with status: green (matches), yellow (minor mismatch), red (major mismatch or missing)
- One-tap "fix this" where API access allows
- For directories without write APIs: deep-link out, prefilled form, "confirm when done" toggle
- "Push my master record to all directories" bulk action on paid plans

### 3.5 Schema Auto-Pilot

Generate and inject correct JSON-LD structured data on the user's website.

- v1 schema types: LocalBusiness, Organization, Service, FAQ, Review, Product (for sites that need it), Article
- Detection: scan user's website, detect existing schema, identify gaps
- Generation: produce correct JSON-LD based on business data and vertical
- Injection methods (in priority order):
  1. WordPress plugin (one-click install)
  2. Shopify app
  3. Squarespace integration
  4. Wix integration
  5. Manual copy-paste with "paste this code in your site's head section" instructions and tutorial video
- Schema is treated as user content (lives in our system as the source of truth, propagates to their site)

### 3.6 Review Coach

Analyze the business's existing reviews, identify language gaps, generate scripts.

- Pull reviews from Google, Yelp, Facebook, TripAdvisor (read-only APIs where available)
- Run NLP analysis to detect missing keywords customers should be using
- Show "Customers don't mention these things you do well: solar installation, Chanote title verification, off-grid living advice"
- Generate review request scripts in user's voice with targeted keyword nudges
- Send scripts via email, SMS, or shareable link with QR code
- Track which review requests converted to actual reviews

### 3.7 Competitor Ghost

Reverse-engineer why competitors win and the user doesn't.

- Auto-identify 3–5 direct competitors based on category + geography + AI search results
- Show "These businesses are getting named instead of you"
- For each competitor: their Findability Score, their schema completeness, their review count, their citation sources
- "Steal their playbook" — specific actions the user can take to match
- Shareable competitor comparison page (this is the viral hook — users screenshot this)

---

## 4. V2 Architectural Hooks

These are NOT built in v1, but v1 architecture accommodates them without refactoring.

1. **Vertical Packages** — Restaurants, Hotels, Tradies, Wellness, Professional Services, Retail. Each gets pre-loaded prompts, vertical-specific schemas, tuned fix queues, competitor sets.
2. **White-Label Agency Mode** — custom domain, custom branding, multi-client management.
3. **AI Content Generator** — generate FAQ content, blog posts, structured answers targeting losing prompts.
4. **Citation Outreach Engine** — semi-automated PR outreach to publications AI engines cite.
5. **Voice Search Optimization** — Siri, Alexa, Google Assistant.
6. **Multi-Language Support** — Spanish, French, German, Thai, Japanese.
7. **Real-Time Alerts** — push notifications on material changes.
8. **AI Engine Coverage Expansion** — Grok, Copilot, Meta AI, Baidu, Yandex, Naver.
9. **Direct Publishing Integrations** — push content/schema to user's CMS without copy-paste.
10. **Open API** — third-party developer access.
11. **Reputation Defense** — detect and remediate AI hallucinations about user's business.
12. **Team Seats** — multi-user accounts.
13. **Marketplace** — vetted freelancers who implement fixes for users.

---

## 5. Brand and Copy Rules

The category is full of jargon-soaked surveillance products. Our positioning is "personal AI visibility coach" — warm, encouraging, plain-spoken, progress-focused.

### 5.1 Voice and Tone

- **Warm but professional.** Like a trainer at a good gym, not a corporate consultant.
- **Specific, never abstract.** "Your hours are wrong on Apple Maps" not "Optimize your business listings."
- **Action-oriented.** Every sentence either explains a current state or invites a specific action.
- **Confidence without arrogance.** "Here's what to do" not "We recommend you consider doing."
- **Optimistic.** Findability is a problem you can solve. Most users CAN go from invisible to visible. Communicate that.

### 5.2 Banned Words (Centralized Copy File)

These words never appear in user-facing copy. Engineering Claude enforces this at the copy-file level.

- "Schema" (use "the code that tells AI what your business is")
- "JSON-LD" (never reference)
- "NAP" (use "your business name, address, and phone number")
- "Structured data" (use "AI-readable info")
- "Citation" (use "mention" or "got named")
- "Crawler" / "Spider" / "Bot" (use "AI engine" or just "AI")
- "GEO" / "AEO" / "LLM" (never reference)
- "Optimize" (use "improve")
- "Leverage" (use "use")
- "Synergy" (banned absolutely)
- "Solution" (use "fix" or "tool")

### 5.3 Required Phrasings

- The product calls itself "your visibility coach" or just "the coach" in conversational moments.
- The score is "your Findability Score" — capital F, capital S. Always.
- Fixes are "fixes" — singular noun, action-oriented.
- Competitors are "the businesses getting named" — never "competitors" in primary UI (allowed in section headers).
- AI engines are listed by name (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews). Never abbreviated, never grouped as "LLMs."

### 5.4 Copy File Architecture

All user-facing strings live in `/copy/en.json` (and future `/copy/[locale].json`). No hardcoded user-facing strings anywhere in the codebase. PR review enforces this.

Structure:
```json
{
  "onboarding": {
    "welcome.title": "Let's find out if AI sees your business.",
    "welcome.cta": "Start free audit"
  },
  "score": {
    "label": "Your Findability Score",
    "explainer": "How visible your business is to ChatGPT, Perplexity, Claude, Gemini, and Google AI."
  }
}
```

---

## 6. Technical Architecture

### 6.1 Stack Decisions

**Frontend (Web):** React + Vite + TypeScript + TailwindCSS (matches your existing Pai Living stack)
**Frontend (Mobile):** React Native + Expo + TypeScript, deployed via EAS Build
**Shared:** A shared component and utilities package between web and mobile (`/packages/shared`)
**Backend:** Node.js + Fastify + TypeScript (NOT Express — Fastify is 2x faster and the schema-validation story is dramatically better)
**Database:** PostgreSQL (Supabase-hosted at launch, migrate to dedicated Postgres if scale demands)
**Auth:** Supabase Auth (email magic link + Google OAuth for v1)
**Cache & Queue:** Redis + BullMQ
**File Storage:** Supabase Storage (or S3 if Supabase pricing breaks at scale)
**Payments:** Stripe (Stripe Checkout for one-time setup, Stripe Billing for subscriptions)
**Hosting (App):** Fly.io for backend, Vercel for web frontend marketing site
**Hosting (Mobile):** Expo + EAS Build → App Store and Google Play
**Email:** Resend (transactional) + Loops (lifecycle / drip campaigns)
**Analytics:** PostHog (product analytics) + plain Postgres for the data moat
**Error Tracking:** Sentry
**Logs:** Axiom or Better Stack
**AI Engines:** See Section 6.4

### 6.2 Repository Structure

Monorepo using pnpm workspaces:

```
/wegetfound
├── apps/
│   ├── web/                    # React + Vite web app (logged-in product)
│   ├── marketing/              # Astro or Next.js marketing site (public, free audit)
│   ├── mobile/                 # React Native + Expo mobile app
│   └── api/                    # Fastify backend API
├── packages/
│   ├── shared/                 # Shared TypeScript types, utilities, constants
│   ├── ui/                     # Shared React components (web)
│   ├── copy/                   # Centralized copy files (i18n-ready)
│   ├── scoring/                # The Findability Score engine
│   ├── ai-adapters/            # AI engine adapter implementations
│   ├── integrations/           # Directory and CMS integration adapters
│   └── db/                     # Prisma/Drizzle schema + migrations
├── infra/                      # Infrastructure-as-code (Terraform or Pulumi)
└── docs/                       # Internal engineering docs
```

### 6.3 The Multi-Tenant Foundation

Every database record has BOTH `user_id` AND `organization_id`. In v1 every user belongs to a personal organization (auto-created on signup). In v2 organizations contain multiple users (team seats), multiple businesses (agency mode), and white-label settings.

**Critical rule:** Never write code that assumes one-user-equals-one-business. Every query goes through the organization layer.

**Business as first-class entity:** A `business` belongs to an `organization`. A `user` belongs to an `organization` with a `role` (owner, admin, member, viewer). One user can belong to multiple organizations via the `organization_members` table.

### 6.4 The AI Engine Adapter Layer

This is the most important architectural decision in the codebase. Get this right and you can swap engines, add new ones, and survive provider changes without refactoring.

Every AI engine implements this interface:

```typescript
interface AIEngineAdapter {
  readonly engineId: string;          // 'chatgpt', 'perplexity', 'claude', 'gemini', 'google_aio'
  readonly engineName: string;        // Display name
  readonly costPerQuery: number;      // Estimated USD cost
  
  queryPrompt(
    prompt: string,
    context: QueryContext
  ): Promise<EngineResponse>;
  
  parseResponse(
    rawResponse: unknown
  ): ParsedResponse;
  
  extractCitations(
    parsedResponse: ParsedResponse
  ): Citation[];
  
  detectBusinessMention(
    parsedResponse: ParsedResponse,
    business: Business
  ): MentionResult;
}
```

Implementations live in `/packages/ai-adapters/`:
- `chatgpt-adapter.ts` — uses OpenAI API + ChatGPT Search where applicable
- `perplexity-adapter.ts` — uses Perplexity Sonar API
- `claude-adapter.ts` — uses Anthropic Messages API with web search tool
- `gemini-adapter.ts` — uses Google AI API
- `google-aio-adapter.ts` — uses headless browser or SerpAPI for AI Overviews

Business logic NEVER imports a specific adapter. It imports `engineRegistry` which returns active adapters. Adding a new engine is one new file plus one registry registration.

### 6.5 Caching Strategy

API calls to external AI engines are expensive and rate-limited. Aggressive caching is mandatory.

- **Prompt-level cache:** Same prompt + same geography + same vertical = cached for 24–48 hours. Two users in Austin asking "best plumber near me" share the same cache entry.
- **Business-level cache:** Per-business audit results cached for 4 hours.
- **Score history:** Stored permanently, never invalidated.
- **Cache key includes methodology version** so cache invalidates automatically when score formula changes.

Cache layer: Redis with TTL. Backup cache: Postgres `query_cache` table for hits even after Redis eviction.

### 6.6 Background Jobs

All AI queries, schema injections, directory syncs, and email sends are queued, not synchronous. BullMQ on Redis.

Job types:
- `audit:business` — full audit run for a business
- `query:prompt` — single prompt across all engines
- `sync:directory` — push update to one directory
- `inject:schema` — push schema to user's site via plugin or API
- `score:calculate` — recompute Findability Score
- `email:send` — transactional email
- `digest:weekly` — weekly summary email

Each job is idempotent. Each job has retry logic with exponential backoff. Each job emits events to the audit log.

### 6.7 Webhook-Ready Event Bus

Every state change emits an internal event to a Postgres `events` table.

Examples:
- `score.updated`
- `fix.completed`
- `mention.gained` (business appeared in AI response for the first time)
- `mention.lost` (business stopped appearing)
- `competitor.detected`

In v1, internal services subscribe to these. In v2, users and integrations subscribe to them via the open API.

### 6.8 Feature Flags

Every v2 feature has a flag from day one. Flag system: simple `feature_flags` table with org-level overrides.

Example flags:
- `vertical_packages_enabled`
- `white_label_enabled`
- `content_generator_enabled`
- `team_seats_enabled`
- `api_access_enabled`

V1 ships with all v2 flags off. Turn them on as features ship.

---

## 7. Database Schema (Core Tables)

Use Drizzle ORM (modern, TypeScript-native, faster than Prisma). Schema lives in `/packages/db/schema/`.

### 7.1 Core Identity

```sql
-- Users (managed by Supabase Auth, mirrored here)
users (
  id uuid primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  last_active_at timestamptz
)

-- Organizations (every user has at least one)
organizations (
  id uuid primary key,
  name text not null,
  slug text unique not null,
  plan text not null default 'free',  -- free, starter, growth, agency
  stripe_customer_id text,
  stripe_subscription_id text,
  white_label_enabled boolean default false,
  white_label_domain text,
  white_label_logo_url text,
  created_at timestamptz default now()
)

organization_members (
  organization_id uuid references organizations(id),
  user_id uuid references users(id),
  role text not null,  -- owner, admin, member, viewer
  created_at timestamptz default now(),
  primary key (organization_id, user_id)
)
```

### 7.2 Business Layer

```sql
businesses (
  id uuid primary key,
  organization_id uuid references organizations(id) not null,
  name text not null,
  website_url text,
  vertical text not null default 'general',  -- restaurant, hotel, tradie, wellness, etc.
  category text,  -- more granular than vertical
  
  -- NAP master record
  address_line1 text,
  address_line2 text,
  city text,
  region text,  -- state/province
  postal_code text,
  country text,  -- ISO 3166-1 alpha-2
  phone text,
  email text,
  
  -- Geo
  latitude numeric(10,7),
  longitude numeric(10,7),
  
  -- Hours, social, etc as JSONB
  hours_of_operation jsonb,
  social_profiles jsonb,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

### 7.3 Scoring and History

```sql
findability_scores (
  id uuid primary key,
  business_id uuid references businesses(id) not null,
  methodology_version text not null,  -- e.g. 'v1.0', 'v1.1'
  overall_score integer not null,  -- 0-100
  
  -- Per-engine sub-scores
  chatgpt_score integer,
  perplexity_score integer,
  claude_score integer,
  gemini_score integer,
  google_aio_score integer,
  
  -- Underlying data
  prompts_tested integer not null,
  prompts_winning integer not null,
  signals jsonb not null,  -- full breakdown for debugging and analysis
  
  calculated_at timestamptz default now()
)

-- Index for fast latest-score lookups
create index idx_scores_business_calculated on findability_scores(business_id, calculated_at desc);
```

### 7.4 Prompts and Queries

```sql
tracked_prompts (
  id uuid primary key,
  business_id uuid references businesses(id) not null,
  prompt_text text not null,
  is_active boolean default true,
  created_at timestamptz default now()
)

prompt_results (
  id uuid primary key,
  tracked_prompt_id uuid references tracked_prompts(id),
  engine_id text not null,
  business_mentioned boolean not null,
  competitors_mentioned jsonb,  -- array of {name, context, citation_source}
  raw_response jsonb,
  cache_key text,
  queried_at timestamptz default now()
)

create index idx_prompt_results_prompt on prompt_results(tracked_prompt_id, queried_at desc);
```

### 7.5 Fixes and Actions

```sql
fixes (
  id uuid primary key,
  business_id uuid references businesses(id) not null,
  fix_type text not null,  -- schema_missing, nap_mismatch, review_request, etc.
  priority integer not null,  -- 1-100, higher = surface first
  estimated_score_impact integer,
  estimated_minutes integer,
  
  title text not null,
  description text not null,
  action_payload jsonb,  -- structured data for the fix action
  
  status text not null default 'pending',  -- pending, completed, skipped, dismissed
  completed_at timestamptz,
  
  created_at timestamptz default now()
)
```

### 7.6 NAP and Listings

```sql
directory_listings (
  id uuid primary key,
  business_id uuid references businesses(id) not null,
  directory_id text not null,  -- google_business, apple_maps, yelp, etc.
  external_id text,  -- the listing ID in that directory
  
  -- Snapshot of what the directory shows
  listing_name text,
  listing_address text,
  listing_phone text,
  listing_hours jsonb,
  
  -- Comparison to master record
  match_status text not null,  -- match, minor_mismatch, major_mismatch, missing
  last_checked_at timestamptz,
  
  created_at timestamptz default now()
)
```

### 7.7 Schema and Content

```sql
schemas (
  id uuid primary key,
  business_id uuid references businesses(id) not null,
  schema_type text not null,  -- LocalBusiness, FAQ, Service, etc.
  jsonld_content jsonb not null,
  status text not null,  -- draft, published, outdated
  injected_via text,  -- wordpress_plugin, shopify_app, manual, etc.
  injected_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

### 7.8 Audit Log and Events

```sql
events (
  id uuid primary key,
  organization_id uuid references organizations(id) not null,
  business_id uuid references businesses(id),
  user_id uuid references users(id),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz default now()
)

create index idx_events_org_created on events(organization_id, created_at desc);
create index idx_events_business_created on events(business_id, created_at desc);
```

### 7.9 Feature Flags

```sql
feature_flags (
  id uuid primary key,
  flag_name text unique not null,
  default_enabled boolean default false,
  description text
)

organization_feature_flags (
  organization_id uuid references organizations(id),
  flag_name text references feature_flags(flag_name),
  enabled boolean not null,
  primary key (organization_id, flag_name)
)
```

### 7.10 Row-Level Security

Every table with `organization_id` has a Supabase RLS policy:

```sql
create policy "org_isolation" on businesses
  for all
  using (organization_id in (
    select organization_id from organization_members
    where user_id = auth.uid()
  ));
```

This is non-negotiable. RLS is the security boundary between tenants. Bypass only via service role for system jobs.

---

## 8. The Findability Score Methodology

The score is the soul of the product. It must be:
1. **Trusted** — moves predictably based on user actions
2. **Versioned** — methodology evolves without breaking historical comparisons
3. **Proprietary** — our composite, not a raw API output
4. **Explainable** — every user can see why their score is what it is

### 8.1 Score Formula (v1.0)

```
Findability Score = weighted_sum(engine_scores) × signal_multipliers
```

**Engine scores** (each 0–100):
- Calculated by querying 10–30 representative prompts (configured per vertical/geo) and measuring inclusion rate
- ChatGPT: 25% weight (largest user base)
- Perplexity: 20% weight (highest citation rate, highest-intent users)
- Claude: 15% weight (growing rapidly)
- Gemini: 20% weight (Google ecosystem)
- Google AI Overviews: 20% weight (most users see this)

**Signal multipliers** (0.5–1.2):
- Schema completeness (LocalBusiness, FAQ, Service): up to +0.1
- NAP consistency across directories: up to +0.1
- Review velocity and language diversity: up to +0.05
- Website AI-crawler accessibility (robots.txt, llms.txt, schema): up to +0.05
- Penalty for major NAP mismatches: down to ×0.5

### 8.2 Versioning

Every calculated score stores its `methodology_version`. When the formula changes, old scores remain comparable. Display shows the active methodology and explains improvements when version changes.

### 8.3 Per-User Explainability

Each score breakdown shows:
- The 5 engine sub-scores
- Top 3 contributing positive signals
- Top 3 contributing negative signals
- "What to do next" — the top fix in the queue

---

## 9. The API Contract

REST API with typed endpoints. OpenAPI spec maintained in `/apps/api/openapi.yaml`. Auto-generated TypeScript client lives in `/packages/api-client/`.

### 9.1 Public Endpoints (no auth)

```
POST   /audit/free                  Run free public audit
GET    /audit/free/:id              Retrieve free audit result
POST   /leads                       Capture email after free audit
```

### 9.2 Authenticated Endpoints

```
GET    /me                          Current user + active organization
PATCH  /me                          Update user profile

GET    /organizations               List user's organizations
POST   /organizations               Create organization
GET    /organizations/:id           Get organization
PATCH  /organizations/:id           Update organization

GET    /businesses                  List businesses in active org
POST   /businesses                  Create business
GET    /businesses/:id              Get business
PATCH  /businesses/:id              Update business
DELETE /businesses/:id              Delete business

POST   /businesses/:id/audit        Trigger fresh audit
GET    /businesses/:id/score        Latest Findability Score
GET    /businesses/:id/score/history  Score history

GET    /businesses/:id/fixes        Fix queue
POST   /fixes/:id/complete          Mark fix complete
POST   /fixes/:id/skip              Skip fix

GET    /businesses/:id/prompts      Tracked prompts
POST   /businesses/:id/prompts      Add tracked prompt
POST   /businesses/:id/prompts/test Test prompt live (no save)
DELETE /prompts/:id                 Remove tracked prompt

GET    /businesses/:id/listings     Directory listings
POST   /businesses/:id/listings/sync Sync NAP to all directories

GET    /businesses/:id/schemas      Schema records
POST   /businesses/:id/schemas      Create/update schema
POST   /businesses/:id/schemas/inject Inject schema to user's site

GET    /businesses/:id/reviews      Review analysis
POST   /businesses/:id/reviews/script Generate review request script

GET    /businesses/:id/competitors  Competitor analysis

POST   /webhooks/stripe             Stripe webhook handler
POST   /webhooks/supabase-auth      Supabase Auth webhook
```

### 9.3 Authentication

- All authenticated endpoints require a Supabase JWT in `Authorization: Bearer <token>`
- The JWT contains `sub` (user_id) and a custom claim `active_org_id`
- Every endpoint checks RLS implicitly via Supabase, plus an explicit org-membership check at the application layer

---

## 10. Onboarding Flow

The first 90 seconds determine conversion. Get this perfect.

### 10.1 The Free Audit (Anonymous, Marketing Site)

1. User lands on wegetfound.ai/audit
2. Single input field: "What's your business name?"
3. Autocomplete via Google Places API
4. User selects their business (or enters website if not on Google)
5. Loading state: "Asking ChatGPT, Perplexity, Claude, Gemini, and Google AI about your business..."
   - Progress indicator shows each engine completing
   - Takes 30–60 seconds, animated with educational micro-content
6. Score reveal with animation
7. Per-engine breakdown
8. Top 3 fixes preview (blurred for non-signed-up users)
9. CTA: "Save this report and track changes — enter your email"
10. Email capture → magic link signup → routed to web app

### 10.2 First Login Flow (Web)

1. Magic link click → authenticated session
2. "Welcome to your visibility coach" — 3 screen explainer (skippable)
3. "Confirm your business info" — pre-filled from Google Places
4. Connect Google Business Profile (OAuth) — strongly encouraged, skippable
5. Land on home screen with full Findability Score and Daily Fix ready

### 10.3 Mobile App First Run

1. Download app
2. Login with email magic link
3. Brief tour: "Here's your score, here's today's fix, here's how to test a prompt"
4. Home screen

---

## 11. Monetization Wiring

### 11.1 Pricing

- **Free**: 1 audit per month, no ongoing tracking, no fixes
- **Starter** ($19/mo or $190/yr): 1 business, weekly tracking, 10 prompts, Fix Queue, schema, basic NAP
- **Growth** ($49/mo or $490/yr): 3 businesses, daily tracking, 30 prompts, all features
- **Agency** ($149/mo or $1490/yr): 10 businesses, white-label foundation (full white-label in v2), API access, priority support
- **Enterprise** (custom): 25+ businesses, dedicated support

### 11.2 Stripe Integration

- Stripe Checkout for new subscriptions (hosted page, less surface area for bugs)
- Stripe Billing Portal for existing customers (self-serve plan changes, cancellations)
- Stripe webhooks update `organization.plan`, `stripe_customer_id`, `stripe_subscription_id`
- Mobile app NEVER mentions price, NEVER links to checkout
- Failed payments → 3-day grace period → downgrade to free with data preserved

### 11.3 Free-to-Paid Conversion Triggers

The product surfaces upgrade prompts at specific moments:
- After completing first fix (free tier hits its monthly cap)
- After running a competitor analysis (gated to paid)
- When user wants to add a 2nd tracked prompt (free has 1)
- When user wants to enable schema auto-pilot

Each upgrade prompt is contextual ("To track this prompt going forward, upgrade to Starter") not generic.

---

## 12. Build Sequence (16-Week Plan)

### Weeks 1–2: Foundation
- Repo setup, monorepo, CI/CD pipelines
- Supabase project, auth, RLS policies
- Database schema, migrations, seed data
- API skeleton with Fastify, OpenAPI spec
- Stripe account setup (test mode)

### Weeks 3–4: AI Engine Adapter Layer
- Adapter interface
- ChatGPT, Perplexity, Claude, Gemini, Google AIO implementations
- Caching layer (Redis + Postgres backup)
- Job queue (BullMQ) for async queries
- End-to-end test: query a prompt across all 5 engines and store results

### Weeks 5–6: Findability Score Engine
- Score calculation methodology v1.0
- Score history tracking
- Per-engine sub-scores
- Signal multiplier calculations

### Weeks 7–8: Web App Core
- Authentication flow (magic link + Google OAuth)
- Onboarding (business creation, Google Places autocomplete)
- Home screen: score + daily fix
- Score history view
- Settings

### Week 9: Free Audit (Marketing Site)
- Anonymous audit flow
- Email capture
- Magic link conversion
- 5-email drip sequence (Resend + Loops)

### Weeks 10–11: NAP Fix-It + Schema Auto-Pilot
- Google Business Profile integration
- Apple Business Connect, Bing Places, Yelp, Facebook, TripAdvisor adapters
- NAP comparison logic
- Schema generation engine (LocalBusiness, FAQ, Service, Review)
- WordPress plugin (one-click install)

### Week 12: Review Coach + Competitor Ghost
- Review pull from Google + Yelp + Facebook
- NLP analysis for keyword gaps
- Review script generation
- Competitor detection algorithm
- Competitor comparison page

### Week 13: Stripe + Paid Plans
- Stripe Checkout integration
- Plan gating logic
- Upgrade prompts at conversion moments
- Billing portal

### Week 14: Mobile App
- React Native + Expo setup
- Auth (shared with web via Supabase)
- Home screen (score + fix)
- Live prompt testing
- Push notifications (Expo Push)
- TestFlight + Google Play Internal Testing

### Week 15: Polish & Performance
- Loading states, skeleton screens, error handling
- Accessibility audit
- Performance optimization
- Sentry + PostHog setup
- Beta with Pai Living + 5 friendly users

### Week 16: Launch Prep
- App Store submission (iOS)
- Google Play submission (Android)
- Marketing site final copy
- Launch checklist
- Customer support documentation
- Initial blog content for SEO

---

## 13. Do This / Never Do This

### Do This

- **Build for Persona A first.** Every design decision passes the 50-year-old café owner test.
- **Use the adapter pattern for every external dependency.** AI engines, directories, CMS, payment, email — all behind interfaces.
- **Multi-tenant everything from day one.** `organization_id` on every record. Never assume one-user-one-business.
- **Versioned methodology.** The Findability Score has a version. Score records reference it. Methodology can evolve without breaking history.
- **Cache aggressively.** Redis for hot, Postgres for warm, never invalidate score history.
- **Type everything.** TypeScript strict mode. Drizzle ORM. OpenAPI-typed clients. No `any` types in PR review.
- **Centralized copy.** All user-facing strings in `/packages/copy/en.json`. No hardcoded strings.
- **Feature flag v2 features.** Database fields and API endpoints exist with flags off.
- **Event-source state changes.** Every meaningful action emits to the `events` table.
- **Test the score loop.** Pai Living, Pai Land Solutions, and Pai Off-Grid are the first three customers. Every feature gets tested against them in real time.
- **Web-first, mobile-second.** Web app is the product. Mobile is a window.

### Never Do This

- **Never use Apple In-App Purchase.** Web-first only. The mobile app must not reference pricing or signup.
- **Never use jargon in user-facing copy.** Schema, NAP, JSON-LD, GEO, AEO, LLM, citation — all banned in UI.
- **Never call AI engine APIs from business logic directly.** Always go through the adapter layer.
- **Never write code that assumes one user equals one business.** Multi-tenant from day one.
- **Never make a score change without storing the methodology version.** Comparability is sacred.
- **Never ship a feature without telemetry.** Every fix completion, score change, prompt result is logged.
- **Never let the mobile app become a thin client.** It must have meaningful free functionality (audits, score viewing, browsing) so Apple doesn't reject it.
- **Never run synchronous AI engine queries from a user-facing request.** Always queue, always async.
- **Never store API keys in code.** Environment variables only. Use Doppler or Infisical for secret management.
- **Never bypass RLS without explicit comment explaining why.** Service-role queries are flagged in PR review.
- **Never let the score drop for a user without an explanation in-app.** "Your score went down because X changed."
- **Never let scope creep happen.** The seven features in Section 3 are v1. Everything else is v2.

---

## 14. Customer Zero: Pai Living

The first three businesses in production are:

1. **Pai Living** (pailiving.com) — lifestyle blog and master brand
2. **Pai Land Solutions** (pailandsolutions.com) — land leasing
3. **Pai Off-Grid** (paioffgrid.com) — solar and water wells

These are real businesses with real customers in Pai, Mae Hong Son Province, Thailand. The founder operates them. Every feature gets tested against these businesses before shipping.

Specific tests to run on launch day:

- "Best off-grid land consultant in northern Thailand" — does Pai Land Solutions appear?
- "Solar installation Pai Thailand" — does Pai Off-Grid appear?
- "Off-grid living blog Thailand" — does Pai Living appear?
- "How to lease land in Pai as a foreigner" — does Pai Land Solutions appear?
- "Cost of living in Pai Thailand" — does Pai Living appear?

Track scores over 90 days post-launch. If all three businesses don't show measurable score improvement, the product needs work before scaling.

---

## 15. Engineering Operating Principles

1. **Ship weekly.** Every Friday, something visible ships. Even if it's small.
2. **Trunk-based development.** Short-lived branches, merge to main daily.
3. **PR review enforces this document.** If a PR violates a rule in Section 13, it's rejected with a link to the violated rule.
4. **Tests over docs.** Tests are documentation that doesn't lie.
5. **Logs over hopes.** Every error path logs to Sentry with enough context to debug from logs alone.
6. **Feature flags over branches.** Long-lived feature work happens behind flags in main, not in long branches.
7. **Documentation lives next to code.** Each package has a README. Each integration has a runbook.
8. **The founder is the product manager.** Pai Living's needs drive the roadmap until the company has its own product team.

---

## 16. What to Tell Engineering Claude On First Run

When handing this document to an engineering AI agent for the first time, the initial prompt should be:

> "You are building wegetfound.ai. This document is your source of truth. Read it completely before writing any code. After reading, confirm you understand the seven core features, the multi-tenant architecture requirement, the web-first/no-IAP rule, the plain-language copy rule, and the adapter pattern for AI engines. Do not begin implementation until you've confirmed these. Then start with Section 12, Week 1: monorepo setup, Supabase project, database schema, API skeleton. After each week's work, summarize what shipped and what's next."

---

**End of document.**

For questions or amendments, the founder is the only authority. This document evolves through versioned commits in the `/docs` directory of the main repository.
