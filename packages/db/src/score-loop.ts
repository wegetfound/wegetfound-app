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
import { eq, and } from 'drizzle-orm';

// Proves the full score loop end-to-end against Customer Zero (§14).
// Runs all active tracked prompts through the Claude adapter, stores results,
// then computes + stores a Findability Score per business. One-shot CLI script.

const adapter = engineRegistry.get('claude');

// Baseline signals — no crawl/schema/review data yet; expand in Week 5.
const BASELINE_SIGNALS: Signals = {
  schemaCompleteness: 0,
  napConsistency: 0,
  reviewHealth: 0,
  crawlerAccessibility: 0,
  hasMajorNapMismatch: false,
};

async function run() {
  console.log('\n=== wegetfound.ai — Score Loop v1.0 ===\n');

  // 1. Load all active prompts with their business
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

  console.log(`Found ${rows.length} active prompts across ${new Set(rows.map((r) => r.businessId)).size} businesses.\n`);

  // 2. Run each prompt through Claude
  const results: { promptId: string; businessId: string; businessName: string; mentioned: boolean }[] = [];

  for (const row of rows) {
    const geo = row.city && row.country ? `${row.city}, ${row.country}` : undefined;
    process.stdout.write(`  [claude] "${row.promptText}" → `);

    try {
      const engineResponse = await adapter.queryPrompt(row.promptText, { geography: geo });
      const parsed = adapter.parseResponse(engineResponse.raw);
      const mention = adapter.detectBusinessMention(parsed, { name: row.businessName });

      const symbol = mention.mentioned ? '✓ mentioned' : '✗ not found';
      console.log(`${symbol} (${row.businessName})`);

      // 3. Persist to prompt_results
      await db.insert(promptResults).values({
        trackedPromptId: row.promptId,
        engineId: 'claude',
        businessMentioned: mention.mentioned,
        competitorsMentioned: mention.competitors,
        rawResponse: parsed as unknown as Record<string, unknown>,
        cacheKey: `claude:${METHODOLOGY_VERSION}:${row.promptId}`,
      });

      results.push({
        promptId: row.promptId,
        businessId: row.businessId,
        businessName: row.businessName,
        mentioned: mention.mentioned,
      });
    } catch (err) {
      console.log(`ERROR — ${String(err)}`);
    }
  }

  // 4. Compute + store a score per business
  console.log('\n--- Findability Scores ---\n');

  const businessIds = [...new Set(results.map((r) => r.businessId))];

  for (const businessId of businessIds) {
    const bResults = results.filter((r) => r.businessId === businessId);
    const businessName = bResults[0]?.businessName ?? businessId;
    const promptsTested = bResults.length;
    const promptsWinning = bResults.filter((r) => r.mentioned).length;

    const claudeScore = inclusionScore(promptsTested, promptsWinning);

    const engineScores: EngineScores = {
      chatgpt: 0,
      perplexity: 0,
      claude: claudeScore,
      gemini: 0,
      google_aio: 0,
    };

    const breakdown = computeFindabilityScore(engineScores, BASELINE_SIGNALS);

    await db.insert(findabilityScores).values({
      businessId,
      methodologyVersion: METHODOLOGY_VERSION,
      overallScore: breakdown.overallScore,
      chatgptScore: breakdown.perEngine.chatgpt,
      perplexityScore: breakdown.perEngine.perplexity,
      claudeScore: breakdown.perEngine.claude,
      geminiScore: breakdown.perEngine.gemini,
      googleAioScore: breakdown.perEngine.google_aio,
      promptsTested,
      promptsWinning,
      signals: { ...BASELINE_SIGNALS, breakdown },
    });

    console.log(`  ${businessName}`);
    console.log(`    Claude: ${claudeScore}/100  (${promptsWinning}/${promptsTested} prompts)`);
    console.log(`    Overall Findability Score: ${breakdown.overallScore}/100`);
    console.log(`    Methodology: ${METHODOLOGY_VERSION}\n`);
  }

  console.log('=== Done. All scores stored. ===\n');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
