import { db } from './client';
import {
  users,
  organizations,
  organizationMembers,
  businesses,
  trackedPrompts,
  featureFlags,
} from './schema/index';

// Customer Zero (§14): the founder's three real Pai businesses. Every feature is
// tested against these before shipping. Also seeds the v2 feature-flag catalog (§6.8).

const FOUNDER_USER_ID = '00000000-0000-0000-0000-000000000001';

// All v2 features exist as flags from day one, default OFF (§6.8, §13).
const V2_FLAGS: { name: string; description: string }[] = [
  { name: 'vertical_packages_enabled', description: 'Vertical packages (restaurants, hotels, tradies, etc.)' },
  { name: 'white_label_enabled', description: 'White-label agency mode' },
  { name: 'content_generator_enabled', description: 'AI content generator' },
  { name: 'team_seats_enabled', description: 'Multi-user team accounts' },
  { name: 'api_access_enabled', description: 'Open API third-party access' },
];

async function seed() {
  console.log('Seeding Customer Zero + feature flags...');

  await db
    .insert(featureFlags)
    .values(V2_FLAGS.map((f) => ({ flagName: f.name, defaultEnabled: false, description: f.description })))
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({ id: FOUNDER_USER_ID, email: 'junglelivingpai@protonmail.com', fullName: 'Founder' })
    .onConflictDoNothing();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'Pai Living LLC', slug: 'pai-living', plan: 'agency' })
    .onConflictDoNothing()
    .returning();

  if (!org) {
    console.log('Org already seeded — skipping business inserts.');
    return;
  }

  await db
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: FOUNDER_USER_ID, role: 'owner' });

  const inserted = await db
    .insert(businesses)
    .values([
      {
        organizationId: org.id,
        name: 'Pai Living',
        websiteUrl: 'https://pailiving.com',
        vertical: 'general',
        category: 'Off-grid living blog & master brand',
        city: 'Pai',
        region: 'Mae Hong Son',
        country: 'TH',
      },
      {
        organizationId: org.id,
        name: 'Pai Land Solutions',
        websiteUrl: 'https://pailandsolutions.com',
        vertical: 'professional_services',
        category: 'Land leasing & Chanote title consulting',
        city: 'Pai',
        region: 'Mae Hong Son',
        country: 'TH',
      },
      {
        organizationId: org.id,
        name: 'Pai Off-Grid',
        websiteUrl: 'https://paioffgrid.com',
        vertical: 'tradie',
        category: 'Solar installation & water wells',
        city: 'Pai',
        region: 'Mae Hong Son',
        country: 'TH',
      },
    ])
    .returning();

  // Launch-day test prompts (§14) — the queries we track from day one.
  const byName = (n: string) => inserted.find((b) => b.name === n)!;
  await db.insert(trackedPrompts).values([
    { businessId: byName('Pai Land Solutions').id, promptText: 'Best off-grid land consultant in northern Thailand' },
    { businessId: byName('Pai Land Solutions').id, promptText: 'How to lease land in Pai as a foreigner' },
    { businessId: byName('Pai Off-Grid').id, promptText: 'Solar installation Pai Thailand' },
    { businessId: byName('Pai Living').id, promptText: 'Off-grid living blog Thailand' },
    { businessId: byName('Pai Living').id, promptText: 'Cost of living in Pai Thailand' },
  ]);

  console.log(`Seeded org ${org.id} with ${inserted.length} businesses and 5 tracked prompts.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
