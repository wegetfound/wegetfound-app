# Secret management

Per CLAUDE.md §13: **no API keys in code, ever.** Environment variables only, managed through a secret manager — never committed.

## Local development

1. `cp .env.example .env`
2. Fill in values (see `.env.example` for the full list).
3. `.env` is gitignored and must never be committed.

## CI / production: Doppler (recommended) or Infisical

We do not store secrets in GitHub Actions secrets directly beyond a single service token. Instead:

- **Doppler** holds all secrets per environment (`dev`, `staging`, `prod`).
- CI authenticates with a `DOPPLER_TOKEN` (the only GitHub Actions secret) and injects the rest at runtime: `doppler run -- pnpm build`.
- Fly.io / Vercel pull from Doppler via their integrations, so deployed apps never see a `.env` file.

## The secret inventory

| Group | Keys | Owner |
|---|---|---|
| Database / Auth | `DATABASE_URL`, `SUPABASE_*` | Supabase project |
| Cache/Queue | `REDIS_URL` | Fly Redis / Upstash |
| AI engines | `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `SERPAPI_KEY` | each provider |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Stripe (test first) |
| Email | `RESEND_API_KEY`, `LOOPS_API_KEY` | Resend / Loops |
| Integrations | `GOOGLE_PLACES_API_KEY` | Google Cloud |
| Observability | `SENTRY_DSN`, `POSTHOG_API_KEY` | Sentry / PostHog |

## Hard rules

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — server-only, never shipped to web/mobile bundles.
- Stripe stays in **test mode** until Week 13 (§12).
- Rotate any key that ever lands in a commit, log, or screenshot.
