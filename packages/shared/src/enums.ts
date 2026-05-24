// Shared domain enums. Stored as text columns in Postgres (§7) for migration
// flexibility, but typed here so the app and DB agree on allowed values.

export const PLANS = ['free', 'starter', 'growth', 'agency', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const ORG_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const VERTICALS = [
  'general',
  'restaurant',
  'hotel',
  'tradie',
  'wellness',
  'professional_services',
  'retail',
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const FIX_TYPES = [
  'schema_missing',
  'nap_mismatch',
  'missing_faq',
  'review_request',
  'review_response',
  'content_gap',
  'listing_update',
] as const;
export type FixType = (typeof FIX_TYPES)[number];

export const FIX_STATUSES = ['pending', 'completed', 'skipped', 'dismissed'] as const;
export type FixStatus = (typeof FIX_STATUSES)[number];

export const MATCH_STATUSES = ['match', 'minor_mismatch', 'major_mismatch', 'missing'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const DIRECTORY_IDS = [
  'google_business',
  'apple_business',
  'bing_places',
  'yelp',
  'facebook',
  'tripadvisor',
  'yellow_pages',
] as const;
export type DirectoryId = (typeof DIRECTORY_IDS)[number];

export const SCHEMA_TYPES = [
  'LocalBusiness',
  'Organization',
  'Service',
  'FAQ',
  'Review',
  'Product',
  'Article',
] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const SCHEMA_STATUSES = ['draft', 'published', 'outdated'] as const;
export type SchemaStatus = (typeof SCHEMA_STATUSES)[number];

// Internal event bus (§6.7). v1 internal subscribers; v2 exposed via open API.
export const EVENT_TYPES = [
  'score.updated',
  'fix.completed',
  'fix.skipped',
  'mention.gained',
  'mention.lost',
  'competitor.detected',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
