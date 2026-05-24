import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import type { EngineId } from '@wegetfound/shared';
import { businesses } from './business';

// Prompts a business tracks over time (§7.4). The "aha moment" feature (§3.3).
export const trackedPrompts = pgTable('tracked_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  promptText: text('prompt_text').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// One row per (prompt, engine, run). raw_response cached; cache_key includes the
// methodology version so it invalidates when the formula changes (§6.5).
export const promptResults = pgTable(
  'prompt_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackedPromptId: uuid('tracked_prompt_id').references(() => trackedPrompts.id, {
      onDelete: 'cascade',
    }),
    engineId: text('engine_id').$type<EngineId>().notNull(),
    businessMentioned: boolean('business_mentioned').notNull(),
    competitorsMentioned: jsonb('competitors_mentioned'), // [{ name, context, citationSource }]
    rawResponse: jsonb('raw_response'),
    cacheKey: text('cache_key'),
    queriedAt: timestamp('queried_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_prompt_results_prompt').on(t.trackedPromptId, t.queriedAt.desc())],
);
