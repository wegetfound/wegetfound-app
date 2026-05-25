import { and, eq } from 'drizzle-orm';
import { engineRegistry } from '@wegetfound/ai-adapters';
import { computeFindabilityScore, inclusionScore, METHODOLOGY_VERSION } from '@wegetfound/scoring';
import type { EngineScores, ScoreBreakdown } from '@wegetfound/scoring';
import { auditBusiness, contentGapFinding } from '@wegetfound/audit';
import type { Finding } from '@wegetfound/audit';
import { ENGINE_IDS } from '@wegetfound/shared';
import type { EngineId } from '@wegetfound/shared';
import { db } from './client';
import { businesses, trackedPrompts, promptResults, findabilityScores } from './schema/index';
import { syncFixesForBusiness } from './fixes-sync';

// The audit job for ONE business (§6.6): audit the site for on-site signals, query
// every live engine for each active prompt, compute + store the Findability Score,
// then reconcile the fix queue. Pure orchestration over the other packages so both
// the CLI loop and the API endpoint share identical behavior. Engines that error
// (missing key, region block) are added to `dead` and skipped thereafter.

export interface ScoreBusinessResult {
  businessId: string;
  businessName: string;
  breakdown: ScoreBreakdown;
  perEngineStored: Record<EngineId, number | null>;
  promptsTested: number;
  promptsWinning: number;
  liveEngines: EngineId[];
  findings: Finding[];
  fixSync: { created: number; updated: number; removed: number };
}

export interface ScoreBusinessOptions {
  /** Shared across businesses so a keyless/blocked engine isn't retried each time. */
  dead?: Set<EngineId>;
  onLog?: (msg: string) => void;
}

const firstLine = (e: unknown): string => String(e).split('\n')[0]?.slice(0, 140) ?? '';

export async function scoreBusiness(
  businessId: string,
  opts: ScoreBusinessOptions = {},
): Promise<ScoreBusinessResult> {
  const dead = opts.dead ?? new Set<EngineId>();
  const log = opts.onLog ?? (() => {});
  const engines = engineRegistry.all();

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) throw new Error(`Business not found: ${businessId}`);

  const prompts = await db
    .select({ id: trackedPrompts.id, promptText: trackedPrompts.promptText })
    .from(trackedPrompts)
    .where(and(eq(trackedPrompts.businessId, businessId), eq(trackedPrompts.isActive, true)));

  // 1. On-site signals.
  const audit = await auditBusiness({
    name: biz.name,
    websiteUrl: biz.websiteUrl,
    phone: biz.phone,
    addressLine1: biz.addressLine1,
    city: biz.city,
    postalCode: biz.postalCode,
  });
  const s = audit.signals;
  log(
    `audit ${biz.name}: crawler:${s.crawlerAccessibility.toFixed(2)} schema:${s.schemaCompleteness.toFixed(2)} nap:${s.napConsistency.toFixed(2)} reviews:${s.reviewHealth.toFixed(2)}`,
  );

  // 2. Query live engines per prompt.
  const geo = biz.city && biz.country ? `${biz.city}, ${biz.country}` : undefined;
  const byEngine = new Map<EngineId, { tested: number; winning: number }>();
  const live = new Set<EngineId>();
  const promptWon: { promptText: string; won: boolean }[] = [];

  for (const p of prompts) {
    let won = false;
    for (const engine of engines) {
      if (dead.has(engine.engineId)) continue;
      try {
        const response = await engine.queryPrompt(p.promptText, { geography: geo });
        const parsed = engine.parseResponse(response.raw);
        const mention = engine.detectBusinessMention(parsed, { name: biz.name });
        live.add(engine.engineId);

        const stat = byEngine.get(engine.engineId) ?? { tested: 0, winning: 0 };
        stat.tested += 1;
        if (mention.mentioned) {
          stat.winning += 1;
          won = true;
        }
        byEngine.set(engine.engineId, stat);

        await db.insert(promptResults).values({
          trackedPromptId: p.id,
          engineId: engine.engineId,
          businessMentioned: mention.mentioned,
          competitorsMentioned: mention.competitors,
          rawResponse: parsed as unknown as Record<string, unknown>,
          cacheKey: `${engine.engineId}:${METHODOLOGY_VERSION}:${p.id}`,
        });
        log(`  [${engine.engineId}] ${mention.mentioned ? '✓' : '✗'} "${p.promptText}"`);
      } catch (err) {
        log(`  [${engine.engineId}] disabled — ${firstLine(err)}`);
        dead.add(engine.engineId);
      }
    }
    promptWon.push({ promptText: p.promptText, won });
  }

  // 3. Compute the score (real inclusion for tested engines; null/0 for untested).
  const engineScores = {} as EngineScores;
  const perEngineStored: Record<EngineId, number | null> = {} as Record<EngineId, number | null>;
  let promptsTested = 0;
  let promptsWinning = 0;
  for (const id of ENGINE_IDS) {
    const stat = byEngine.get(id);
    if (stat && stat.tested > 0) {
      const sc = inclusionScore(stat.tested, stat.winning);
      engineScores[id] = sc;
      perEngineStored[id] = sc;
      promptsTested += stat.tested;
      promptsWinning += stat.winning;
    } else {
      engineScores[id] = 0;
      perEngineStored[id] = null;
    }
  }
  const breakdown = computeFindabilityScore(engineScores, audit.signals);

  // 4. Store the score row (append-only history).
  await db.insert(findabilityScores).values({
    businessId,
    methodologyVersion: METHODOLOGY_VERSION,
    overallScore: breakdown.overallScore,
    chatgptScore: perEngineStored.chatgpt,
    perplexityScore: perEngineStored.perplexity,
    claudeScore: perEngineStored.claude,
    geminiScore: perEngineStored.gemini,
    googleAioScore: perEngineStored.google_aio,
    promptsTested,
    promptsWinning,
    signals: { ...audit.signals, breakdown, findings: audit.findings },
  });

  // 5. Reconcile the fix queue: audit findings + a content gap per unsurfaced prompt.
  const contentGaps = promptWon.filter((p) => !p.won).map((p) => contentGapFinding(p.promptText));
  const findings = [...audit.findings, ...contentGaps];
  const fixSync = await syncFixesForBusiness(businessId, findings);

  return {
    businessId,
    businessName: biz.name,
    breakdown,
    perEngineStored,
    promptsTested,
    promptsWinning,
    liveEngines: [...live],
    findings,
    fixSync,
  };
}
