import { pgTable, uuid, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import type { Vertical } from '@wegetfound/shared';
import { organizations } from './identity';

// A business belongs to an organization (§7.2). This is the first-class entity
// everything else hangs off — scores, prompts, fixes, listings, schemas.
export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  websiteUrl: text('website_url'),
  vertical: text('vertical').$type<Vertical>().notNull().default('general'),
  category: text('category'),

  // NAP master record — the source of truth we push to directories.
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  country: text('country'), // ISO 3166-1 alpha-2
  phone: text('phone'),
  email: text('email'),

  // Geo
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),

  hoursOfOperation: jsonb('hours_of_operation'),
  socialProfiles: jsonb('social_profiles'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
