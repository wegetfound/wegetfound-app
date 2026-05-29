import { describe, it, expect } from 'vitest';
import {
  computeFindabilityScore,
  weightedEngineBase,
  inclusionScore,
  METHODOLOGY_VERSION,
} from './score.js';
import type { EngineScores, Signals } from './types.js';

const perfectEngines: EngineScores = {
  chatgpt: 100,
  perplexity: 100,
  claude: 100,
  gemini: 100,
  google_aio: 100,
};
const zeroEngines: EngineScores = {
  chatgpt: 0,
  perplexity: 0,
  claude: 0,
  gemini: 0,
  google_aio: 0,
};
const neutralSignals: Signals = {
  schemaCompleteness: 0,
  napConsistency: 0,
  reviewHealth: 0,
  crawlerAccessibility: 0,
  hasMajorNapMismatch: false,
};

describe('inclusionScore', () => {
  it('is the rounded inclusion percentage', () => {
    expect(inclusionScore(20, 5)).toBe(25);
    expect(inclusionScore(3, 1)).toBe(33);
  });
  it('is 0 when nothing tested', () => {
    expect(inclusionScore(0, 0)).toBe(0);
  });
});

describe('weightedEngineBase', () => {
  it('sums to 100 when all engines are perfect (weights total 1.0)', () => {
    expect(weightedEngineBase(perfectEngines)).toBeCloseTo(100);
  });

  it('backward-compat: calling without liveEngines gives 100 for perfect engines', () => {
    expect(weightedEngineBase(perfectEngines)).toBeCloseTo(100);
  });

  it('backward-compat: calling without liveEngines gives 0 for zero engines', () => {
    expect(weightedEngineBase(zeroEngines)).toBeCloseTo(0);
  });

  it('partial liveness: 3 live engines all at 100 re-normalises to 100', () => {
    // chatgpt (0.25) + perplexity (0.20) are dead; claude (0.15) + gemini (0.20) + google_aio (0.20) are live.
    // live weight sum = 0.55; weighted sum over live = 0.55 * 100; result = 100.
    const scores: EngineScores = {
      chatgpt: 0,
      perplexity: 0,
      claude: 100,
      gemini: 100,
      google_aio: 100,
    };
    expect(weightedEngineBase(scores, ['claude', 'gemini', 'google_aio'])).toBeCloseTo(100);
  });
});

describe('computeFindabilityScore', () => {
  it('stamps the methodology version', () => {
    const r = computeFindabilityScore(perfectEngines, neutralSignals);
    expect(r.methodologyVersion).toBe(METHODOLOGY_VERSION);
  });

  it('neutral signals leave the weighted base unchanged', () => {
    const r = computeFindabilityScore(perfectEngines, neutralSignals);
    expect(r.multiplier).toBe(1);
    expect(r.overallScore).toBe(100);
  });

  it('caps the multiplier at 1.2 with all bonuses maxed', () => {
    const r = computeFindabilityScore(perfectEngines, {
      schemaCompleteness: 1,
      napConsistency: 1,
      reviewHealth: 1,
      crawlerAccessibility: 1,
      hasMajorNapMismatch: false,
    });
    expect(r.multiplier).toBe(1.2);
    expect(r.overallScore).toBe(100); // already clamped to 100
  });

  it('applies the ×0.5 penalty for a major mismatch', () => {
    const r = computeFindabilityScore(perfectEngines, {
      ...neutralSignals,
      hasMajorNapMismatch: true,
    });
    expect(r.multiplier).toBe(0.5);
    expect(r.overallScore).toBe(50);
    expect(r.topNegative[0]?.label).toBe('Major business-info mismatch');
  });

  it('clamps to 0 with zero engines', () => {
    const r = computeFindabilityScore(zeroEngines, neutralSignals);
    expect(r.overallScore).toBe(0);
  });

  it('partial liveness: multiplier still applies on top of re-normalised base', () => {
    // 3 live engines (claude, gemini, google_aio) all at 100 → re-normalised base = 100.
    // With the ×0.5 NAP mismatch penalty the overall score should be 50.
    const scores: EngineScores = {
      chatgpt: 0,
      perplexity: 0,
      claude: 100,
      gemini: 100,
      google_aio: 100,
    };
    const r = computeFindabilityScore(scores, { ...neutralSignals, hasMajorNapMismatch: true }, [
      'claude',
      'gemini',
      'google_aio',
    ]);
    expect(r.weightedBase).toBeCloseTo(100);
    expect(r.multiplier).toBe(0.5);
    expect(r.overallScore).toBe(50);
  });
});
