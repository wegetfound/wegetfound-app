import './load-env'; // must be first — overrides shell empty-vars before any module reads process.env
import { db } from './client';
import {
  businesses,
  trackedPrompts,
  promptResults,
  findabilityScores,
} from './schema/index';
import { engineRegistry } from '@wegetfound/ai-adapters';
import { computeFindabilityScore, inclusionScore, METHODOLOGY_VERSION } from '@wegetfound/scoring';
import type { EngineScores, Signals } from '@wegetfound/scoring';
import { ENGINE_IDS } from '@wegetfound/shared';
import type { EngineId } from '@wegetfound/shared';
import { eq } from 'drizzle-orm';

// Proves the full score loop end-to-end against Customer Zero (§14).
// Queries every registered engine for each active prompt, stores results, then
// computes + stores a Findability Score per business. Engines that error (missing
// key, region block, etc.) are disabled for the run after their first failure, so
// the loop degrades gracefully to whatever engines are live. One-shot CLI script.

const engines = engineRegistry.all();

// Baseline signals — no crawl/schema/review data yet; expand in Week 5.
const BASELINE_SIGNALS: Signals = {
  schemaCompleteness: 0,
  napConsistency: 0,
  reviewHealth: 0,
  crawlerAccessibility: 0,
  hasMajorNapMismatch: false,
};

interface EngineStat {
  tested: number;
  winning: number;
}

const firstLine = (e: unknown): string => String(e).split('\n')[0]?.slice(0, 140) ?? '';

async function run() {
  console.log('\n=== wegetfound.ai — Score Loop v1.0 ===\n');

  const rows = await db
    .select({
      promptId: trackedPrompts.id,
      promptText: trackedPrompts.promptText,
      businessId: businesses.id,
      businessName: businesses.name,
      city: businesses.city,
      country: businesses.country,
    })
    .from(trackedPrompts)
    .innerJoin(businesses, eq(businesses.id, trackedPrompts.businessId))
    .where(eq(trackedPrompts.isActive, true));

  const businessCount = new Set(rows.map((r) => r.businessId)).size;
  console.log(`Found ${rows.length} active prompts across ${businessCount} businesses.`);
  console.log(`Engines registered: ${engines.map((e) => e.engineId).join(', ')}\n`);

  // stats[businessId][engineId] = { tested, winning }
  const stats = new Map<string, Map<EngineId, EngineStat>>();
  const live = new Set<EngineId>();
  const dead = new Set<EngineId>(); // engines that errored — skipped for the rest of the run

  const bump = (businessId: string, engineId: EngineId, mentioned: boolean) => {
    let byEngine = stats.get(businessId);
    if (!byEngine) {
      byEngine = new Map();
      stats.set(businessId, byEngine);
    }
    const stat = byEngine.get(engineId) ?? { tested: 0, winning: 0 };
    stat.tested += 1;
    if (mentioned) stat.winning += 1;
    byEngine.set(engineId, stat);
  };

  for (const row of rows) {
    const geo = row.city && row.country ? `${row.city}, ${row.country}` : undefined;
    console.log(`Prompt: "${row.promptText}"  (${row.businessName})`);

    for (const engine of engines) {
      if (dead.has(engine.engineId)) continue;

      try {
        const response = await engine.queryPrompt(row.promptText, { geography: geo });
        const parsed = engine.parseResponse(response.raw);
        const mention = engine.detectBusinessMention(parsed, { name: row.businessName });
        live.add(engine.engineId);
        bump(row.businessId, engine.engineId, mention.mentioned);

        await db.insert(promptResults).values({
          trackedPromptId: row.promptId,
          engineId: engine.engineId,
          businessMentioned: mention.mentioned,
          competitorsMentioned: mention.competitors,
          rawResponse: parsed as unknown as Record<string, unknown>,
          cacheKey: `${engine.engineId}:${METHODOLOGY_VERSION}:${row.promptId}`,
        });

        console.log(`    [${engine.engineId}] ${mention.mentioned ? '✓ mentioned' : '✗ not found'}`);
      } catch (err) {
        console.log(`    [${engine.engineId}] disabled for this run — ${firstLine(err)}`);
        dead.add(engine.engineId);
      }
    }
  }

  console.log('\n--- Findability Scores ---');
  console.log(`Live engines: ${[...live].join(', ') || '(none)'}`);
  if (dead.size) console.log(`Offline engines: ${[...dead].join(', ')}`);
  console.log('');

  for (const [businessId, byEngine] of stats) {
    const businessName = rows.find((r) => r.businessId === businessId)?.businessName ?? businessId;

    // Build EngineScores: real inclusion score for tested engines, 0 for untested.
    // DB stores null for untested engines so the data marks them honestly.
    const engineScores = {} as EngineScores;
    const stored: Record<EngineId, number | null> = {} as Record<EngineId, number | null>;
    let totalTested = 0;
    let totalWinning = 0;

    for (const id of ENGINE_IDS) {
      const stat = byEngine.get(id);
      if (stat && stat.tested > 0) {
        const sc = inclusionScore(stat.tested, stat.winning);
        engineScores[id] = sc;
        stored[id] = sc;
        totalTested += stat.tested;
        totalWinning += stat.winning;
      } else {
        engineScores[id] = 0;
        stored[id] = null;
      }
    }

    const breakdown = computeFindabilityScore(engineScores, BASELINE_SIGNALS);

    await db.insert(findabilityScores).values({
      businessId,
      methodologyVersion: METHODOLOGY_VERSION,
      overallScore: breakdown.overallScore,
      chatgptScore: stored.chatgpt,
      perplexityScore: stored.perplexity,
      claudeScore: stored.claude,
      geminiScore: stored.gemini,
      googleAioScore: stored.google_aio,
      promptsTested: totalTested,
      promptsWinning: totalWinning,
      signals: { ...BASELINE_SIGNALS, breakdown, perEngineStats: Object.fromEntries(byEngine) },
    });

    console.log(`  ${businessName}`);
    for (const id of ENGINE_IDS) {
      if (stored[id] !== null) {
        const stat = byEngine.get(id)!;
        console.log(`    ${id}: ${stored[id]}/100  (${stat.winning}/${stat.tested} prompts)`);
      }
    }
    console.log(`    Overall Findability Score: ${breakdown.overallScore}/100  (${METHODOLOGY_VERSION})\n`);
  }

  console.log('=== Done. All scores stored. ===\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
