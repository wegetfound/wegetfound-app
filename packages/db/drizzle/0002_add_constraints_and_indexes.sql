-- Add constraints and indexes for data safety and performance

-- Organizations: ensure stripe IDs are unique if set
ALTER TABLE organizations
ADD CONSTRAINT organizations_stripe_customer_id_unique UNIQUE (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Stripe subscription should be unique per subscription
ALTER TABLE organizations
ADD CONSTRAINT organizations_stripe_subscription_id_unique UNIQUE (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Leads: email should be indexed for lookups
CREATE INDEX idx_leads_email ON leads(email);

-- Leads: ensure website_url is not empty
ALTER TABLE leads
ADD CONSTRAINT leads_website_url_not_empty CHECK (website_url != '');

-- Businesses: index by organization for list queries
CREATE INDEX idx_businesses_organization_id ON businesses(organization_id);

-- Businesses: index by created_at for sorting
CREATE INDEX idx_businesses_created_at ON businesses(organization_id, created_at DESC);

-- Events: index by organization and event type for filtering
CREATE INDEX idx_events_org_type ON events(organization_id, event_type);

-- Events: index by organization and date for usage tracking
CREATE INDEX idx_events_org_date ON events(organization_id, created_at DESC);

-- Findability scores: index by business for quick lookups
CREATE INDEX idx_findability_scores_business_id ON findability_scores(business_id);

-- Findability scores: index by business and date for historical data
CREATE INDEX idx_findability_scores_business_date ON findability_scores(business_id, evaluated_at DESC);

-- Fixes: index by business for sync operations
CREATE INDEX idx_fixes_business_id ON fixes(business_id);

-- Tracked prompts: index by business for test operations
CREATE INDEX idx_tracked_prompts_business_id ON tracked_prompts(business_id);

-- Tracked prompts: ensure duplicates are caught
CREATE UNIQUE INDEX idx_tracked_prompts_unique ON tracked_prompts(business_id, prompt_text);

-- Organization members: ensure no duplicate memberships
CREATE UNIQUE INDEX idx_organization_members_unique ON organization_members(organization_id, user_id);

-- Users: index email for lookups
CREATE INDEX idx_users_email ON users(email);

-- Ensure Stripe setup state is consistent: if subscription_id is set, customer_id must be set
ALTER TABLE organizations
ADD CONSTRAINT organizations_stripe_consistency CHECK (
  (stripe_subscription_id IS NULL OR stripe_customer_id IS NOT NULL)
);

-- Ensure plan is one of: free, starter, growth, agency
ALTER TABLE organizations
ADD CONSTRAINT organizations_plan_valid CHECK (
  plan IN ('free', 'starter', 'growth', 'agency')
);

-- Ensure org role is valid
ALTER TABLE organization_members
ADD CONSTRAINT organization_members_role_valid CHECK (
  role IN ('owner', 'admin', 'member', 'viewer')
);
