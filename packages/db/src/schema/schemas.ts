import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { SchemaType, SchemaStatus } from '@wegetfound/shared';
import { businesses } from './business';

// Schema Auto-Pilot (§3.5, §7.7). We are the source of truth for the JSON-LD;
// it propagates to the user's site via plugin/app/manual injection.
// Table name "business_schemas" avoids clashing with the SQL keyword "schema".
export const businessSchemas = pgTable('business_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  schemaType: text('schema_type').$type<SchemaType>().notNull(),
  jsonldContent: jsonb('jsonld_content').notNull(),
  status: text('status').$type<SchemaStatus>().notNull(),
  injectedVia: text('injected_via'), // wordpress_plugin, shopify_app, manual, etc.
  injectedAt: timestamp('injected_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
