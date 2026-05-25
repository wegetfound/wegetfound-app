import './load-env'; // must be first — overrides shell empty-vars before any module reads process.env
import { eq } from 'drizzle-orm';
import { ENGINE_IDS } from '@wegetfound/shared';
import type { EngineId } from '@wegetfound/shared';
import { db } from './client';
import { businesses, trackedPrompts } from './schema/index';
import { scoreBusiness } from './score-business';

// Runs the audit job for every Customer-Zero business (§14). Thin driver over
// scoreBusiness — shares one `dead` engine set so a keyless engine is tried once.

async function run() {
  console.log('\n=== wegetfound.ai — Score Loop v1.0 ===\n');

  const ids = await db
    .selectDistinct({ businessId: trackedPrompts.businessId })
    .from(trackedPrompts)
    .innerJoin(businesses, eq(businesses.id, trackedPrompts.businessId))
    .where(eq(trackedPrompts.isActive, true));

  console.log(`${ids.length} businesses with active prompts.\n`);

  const dead = new Set<EngineId>();
  for (const { businessId } of ids) {
    const r = await scoreBusiness(businessId, { dead, onLog: (m) => console.log(m) });
    console.log(`\n  ${r.businessName}`);
    for (const id of ENGINE_IDS) {
      if (r.perEngineStored[id] !== null) console.log(`    ${id}: ${r.perEngineStored[id]}/100`);
    }
    console.log(`    signal multiplier: ×${r.breakdown.multiplier}`);
    console.log(`    Overall Findability Score: ${r.breakdown.overallScore}/100`);
    console.log(`    Fix queue: ${r.fixSync.created} new, ${r.fixSync.updated} updated, ${r.fixSync.removed} resolved\n`);
  }

  console.log('=== Done. All scores stored. ===\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
