import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { EventType } from '@wegetfound/shared';
import { organizations, users } from './identity';
import { businesses } from './business';

// Webhook-ready event bus (§6.7, §7.8). Every meaningful state change emits here.
// v1: internal subscribers. v2: exposed via the open API.
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').$type<EventType>().notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_events_org_created').on(t.organizationId, t.createdAt.desc()),
    index('idx_events_business_created').on(t.businessId, t.createdAt.desc()),
  ],
);
