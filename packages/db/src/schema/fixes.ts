import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import type { FixType, FixStatus } from '@wegetfound/shared';
import { businesses } from './business';

// The Daily Fix queue (§3.2, §7.5). Higher priority surfaces first.
// Skips are tracked, not discarded — we learn what users avoid.
export const fixes = pgTable('fixes', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  fixType: text('fix_type').$type<FixType>().notNull(),
  priority: integer('priority').notNull(), // 1-100, higher = surface first
  estimatedScoreImpact: integer('estimated_score_impact'),
  estimatedMinutes: integer('estimated_minutes'),

  title: text('title').notNull(),
  description: text('description').notNull(),
  actionPayload: jsonb('action_payload'),

  status: text('status').$type<FixStatus>().notNull().default('pending'),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
