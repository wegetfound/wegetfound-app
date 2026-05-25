# Deployment

Two services, deployed from `wegetfound-Ai/wegetfound`:

| Service | Host | Source | URL var consumed |
| --- | --- | --- | --- |
| API (`apps/api`) | Render (Docker, persistent) | `Dockerfile` + `render.yaml` | `WEB_URL` (CORS) |
| Web (`apps/web`) | Vercel (static Vite SPA) | `apps/web/vercel.json` | `VITE_API_URL` |

Deploy **API first** (web needs its URL), then web, then point the API's CORS back at web.

## 1. API → Render

1. Render → **New + → Blueprint** → connect the repo. It reads `render.yaml` and creates `wegetfound-api` (Docker, free plan, health check `/health`).
2. Set these env vars (dashboard → Environment) — copy values from local `.env`:
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `SERPAPI_KEY` (only funded ones need real values; others degrade gracefully)
   - `WEB_URL` — set after step 2 (the Vercel origin)
3. Deploy. Verify `https://<service>.onrender.com/health` returns `{"status":"ok",...}`.

## 2. Web → Vercel

1. Vercel → **Add New → Project** → import the repo. Set **Root Directory = `apps/web`**. (`vercel.json` supplies build command + SPA rewrites.)
2. Env vars (Project Settings → Environment Variables):
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the `sb_publishable_...` key (browser-safe)
   - `VITE_API_URL` = the Render API URL from step 1
3. Deploy. The funnel is at `/audit`; the app root is the login/dashboard.

## 3. Wire together

1. Render → set `WEB_URL` = the Vercel production URL → redeploy (CORS allowlist).
2. Supabase → **Authentication → URL Configuration** → add the Vercel URL to **Site URL** and **Redirect URLs** (so magic-link login redirects back).

## Notes

- Render free tier spins down on idle (~30s cold start on first hit). Fine for v1; upgrade for the public funnel later.
- The authed `POST /businesses/:id/audit` can take ~30–45s (synchronous). Persistent host handles it; this is the trigger to move to a queued job (BullMQ, §6.6) when load grows.
- Secrets live only in each host's dashboard (and local `.env`). Never commit them.
