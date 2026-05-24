-- Row-Level Security (CLAUDE.md §7.10). RLS is THE tenant boundary.
-- Run after `drizzle-kit migrate`. Service-role connections bypass these for
-- system jobs only — every such call site is flagged in PR review.
--
-- Two patterns:
--   1. Tables with organization_id  -> direct membership check
--   2. Tables scoped via business_id -> join through businesses to membership

-- Helper: orgs the current user belongs to.
create or replace function auth_org_ids() returns setof uuid
language sql stable security definer as $$
  select organization_id from organization_members where user_id = auth.uid()
$$;

-- ---- Pattern 1: direct organization_id ----
alter table organizations enable row level security;
create policy org_self on organizations for all
  using (id in (select auth_org_ids()));

alter table organization_members enable row level security;
create policy org_members_isolation on organization_members for all
  using (organization_id in (select auth_org_ids()));

alter table businesses enable row level security;
create policy businesses_isolation on businesses for all
  using (organization_id in (select auth_org_ids()));

alter table events enable row level security;
create policy events_isolation on events for all
  using (organization_id in (select auth_org_ids()));

alter table organization_feature_flags enable row level security;
create policy org_flags_isolation on organization_feature_flags for all
  using (organization_id in (select auth_org_ids()));

-- ---- Pattern 2: scoped via business_id ----
create or replace function auth_business_ids() returns setof uuid
language sql stable security definer as $$
  select id from businesses where organization_id in (select auth_org_ids())
$$;

alter table findability_scores enable row level security;
create policy scores_isolation on findability_scores for all
  using (business_id in (select auth_business_ids()));

alter table tracked_prompts enable row level security;
create policy prompts_isolation on tracked_prompts for all
  using (business_id in (select auth_business_ids()));

alter table prompt_results enable row level security;
create policy prompt_results_isolation on prompt_results for all
  using (tracked_prompt_id in (select id from tracked_prompts
    where business_id in (select auth_business_ids())));

alter table fixes enable row level security;
create policy fixes_isolation on fixes for all
  using (business_id in (select auth_business_ids()));

alter table directory_listings enable row level security;
create policy listings_isolation on directory_listings for all
  using (business_id in (select auth_business_ids()));

alter table business_schemas enable row level security;
create policy schemas_isolation on business_schemas for all
  using (business_id in (select auth_business_ids()));

-- users + feature_flags (global catalog) are intentionally not org-scoped here;
-- users is readable by self, feature_flags is a public catalog of available flags.
alter table users enable row level security;
create policy users_self on users for all using (id = auth.uid());
