# wegetfound.ai

Personal AI visibility coach for small businesses. Helps them get recommended by ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews.

**The single source of truth for all engineering decisions is [`CLAUDE.md`](./CLAUDE.md).** Read it before contributing.

## Stack

- **Web app:** React + Vite + TypeScript + Tailwind (`apps/web`)
- **Marketing + free audit:** Astro (`apps/marketing`)
- **Mobile companion:** React Native + Expo (`apps/mobile`)
- **API:** Node + Fastify + TypeScript (`apps/api`)
- **DB:** PostgreSQL via Supabase, Drizzle ORM (`packages/db`)
- **Cache/Queue:** Redis + BullMQ

## Prerequisites

- Node >= 22
- pnpm 9 (`corepack enable pnpm`, or `iwr https://get.pnpm.io/install.ps1 -useb | iex` on Windows)

## Setup

```bash
pnpm install
cp .env.example .env   # fill in secrets (or use Doppler/Infisical)
pnpm db:migrate
pnpm db:seed           # loads Customer Zero: Pai Living + Pai Land Solutions + Pai Off-Grid
pnpm dev
```

## Monorepo layout

```
apps/        web, marketing, mobile, api
packages/    shared, ui, copy, scoring, ai-adapters, integrations, db
```

## Non-negotiables (enforced in PR review — CLAUDE.md §13)

- Multi-tenant: `organization_id` on every record, RLS as the tenant boundary
- Web-first: no Apple IAP; mobile never shows price or checkout
- Plain language: no jargon in user-facing copy; all strings in `packages/copy`
- Adapter pattern: business logic never imports a concrete AI engine adapter
- Versioned Findability Score: every score row stores its `methodology_version`
