import { ENGINES, ENGINE_IDS } from '@wegetfound/shared';
import type { EngineScores, Signals, ScoreBreakdown, SignalContribution } from './types.js';

// Findability Score methodology v1.0 (CLAUDE.md §8). Pure functions only.
// Bump METHODOLOGY_VERSION whenever the formula changes — every stored score
// records the version it was computed under, so history stays comparable (§8.2).
export const METHODOLOGY_VERSION = 'v1.0';

const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_MAX = 1.2;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Engine sub-score from prompt inclusion rate (§8.1): % of tested prompts where the business appears. */
export function inclusionScore(promptsTested: number, promptsWinning: number): number {
  if (promptsTested <= 0) return 0;
  return Math.round((promptsWinning / promptsTested) * 100);
}

/** Weighted blend of the five engine sub-scores. Weights live in @wegetfound/shared. */
export function weightedEngineBase(scores: EngineScores): number {
  return ENGINE_IDS.reduce((sum, id) => sum + clamp(scores[id], 0, 100) * ENGINES[id].weight, 0);
}

/** Compute the full, explainable Findability Score. */
export function computeFindabilityScore(scores: EngineScores, signals: Signals): ScoreBreakdown {
  const weightedBase = weightedEngineBase(scores);

  // Additive bonuses (each signal scaled by its cap), then a multiplicative penalty.
  const contributions: SignalContribution[] = [
    { label: 'Schema completeness', delta: clamp(signals.schemaCompleteness, 0, 1) * 0.1 },
    { label: 'Business info consistency', delta: clamp(signals.napConsistency, 0, 1) * 0.1 },
    { label: 'Review health', delta: clamp(signals.reviewHealth, 0, 1) * 0.05 },
    { label: 'AI accessibility', delta: clamp(signals.crawlerAccessibility, 0, 1) * 0.05 },
  ];
  if (signals.hasMajorNapMismatch) {
    contributions.push({ label: 'Major business-info mismatch', delta: -0.5 });
  }

  const bonus = contributions.filter((c) => c.delta > 0).reduce((s, c) => s + c.delta, 0);
  const penaltyFactor = signals.hasMajorNapMismatch ? 0.5 : 1;
  const multiplier = clamp((1 + bonus) * penaltyFactor, MULTIPLIER_MIN, MULTIPLIER_MAX);

  const overallScore = Math.round(clamp(weightedBase * multiplier, 0, 100));

  const sorted = [...contributions].sort((a, b) => b.delta - a.delta);
  const topPositive = sorted.filter((c) => c.delta > 0).slice(0, 3);
  const topNegative = sorted.filter((c) => c.delta < 0).slice(0, 3);

  const perEngine = ENGINE_IDS.reduce((acc, id) => {
    acc[id] = clamp(Math.round(scores[id]), 0, 100);
    return acc;
  }, {} as EngineScores);

  return {
    methodologyVersion: METHODOLOGY_VERSION,
    overallScore,
    perEngine,
    weightedBase: Math.round(weightedBase * 100) / 100,
    multiplier: Math.round(multiplier * 1000) / 1000,
    topPositive,
    topNegative,
  };
}
