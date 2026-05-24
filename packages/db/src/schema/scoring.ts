import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { businesses } from './business';

// Findability Score history (§7.3, §8). Every row records its methodology_version
// so the formula can evolve without breaking historical comparisons. Never deleted.
export const findabilityScores = pgTable(
  'findability_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .references(() => businesses.id, { onDelete: 'cascade' })
      .notNull(),
    methodologyVersion: text('methodology_version').notNull(),
    overallScore: integer('overall_score').notNull(), // 0-100

    chatgptScore: integer('chatgpt_score'),
    perplexityScore: integer('perplexity_score'),
    claudeScore: integer('claude_score'),
    geminiScore: integer('gemini_score'),
    googleAioScore: integer('google_aio_score'),

    promptsTested: integer('prompts_tested').notNull(),
    promptsWinning: integer('prompts_winning').notNull(),
    signals: jsonb('signals').notNull(), // full breakdown for debug + explainability

    calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_scores_business_calculated').on(t.businessId, t.calculatedAt.desc())],
);
