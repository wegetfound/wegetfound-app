import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { DirectoryId, MatchStatus } from '@wegetfound/shared';
import { businesses } from './business';

// NAP Fix-It (§3.4, §7.6). One row per (business, directory). match_status drives
// the green/yellow/red map. Compared against the business NAP master record.
export const directoryListings = pgTable('directory_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  directoryId: text('directory_id').$type<DirectoryId>().notNull(),
  externalId: text('external_id'),

  listingName: text('listing_name'),
  listingAddress: text('listing_address'),
  listingPhone: text('listing_phone'),
  listingHours: jsonb('listing_hours'),

  matchStatus: text('match_status').$type<MatchStatus>().notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
