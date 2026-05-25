import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Anonymous free-audit leads (§10.1 — top of funnel). No organization: these are
// captured before signup. Written only by the server (postgres role), so no RLS
// policy is needed — deny-by-default keeps the anon Supabase key out.
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email'),
  websiteUrl: text('website_url').notNull(),
  businessName: text('business_name'),
  // Snapshot of the on-site signals + readiness teaser shown to the lead.
  auditSnapshot: jsonb('audit_snapshot'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
