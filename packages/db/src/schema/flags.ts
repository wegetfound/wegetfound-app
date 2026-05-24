import { pgTable, uuid, text, boolean, primaryKey } from 'drizzle-orm/pg-core';
import { organizations } from './identity';

// Feature flags (§6.8, §7.9). Every v2 feature has a flag from day one.
// v1 ships with all v2 flags off; flip them on as features ship.
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  flagName: text('flag_name').notNull().unique(),
  defaultEnabled: boolean('default_enabled').default(false).notNull(),
  description: text('description'),
});

export const organizationFeatureFlags = pgTable(
  'organization_feature_flags',
  {
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    flagName: text('flag_name')
      .references(() => featureFlags.flagName, { onDelete: 'cascade' })
      .notNull(),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.flagName] })],
);
