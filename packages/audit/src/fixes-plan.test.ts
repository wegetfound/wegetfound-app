import { describe, it, expect } from 'vitest';
import { computePriority, contentGapFinding, diffFixes } from './fixes-plan.js';
import type { Finding } from './types.js';

const finding = (over: Partial<Finding>): Finding => ({
  dedupKey: 'k',
  fixType: 'schema_missing',
  title: 't',
  detail: 'd',
  estimatedScoreImpact: 20,
  estimatedMinutes: 30,
  ...over,
});

describe('computePriority', () => {
  it('ranks high-impact low-effort fixes above low-impact high-effort ones', () => {
    const crawler = computePriority(finding({ estimatedScoreImpact: 35, estimatedMinutes: 10 }));
    const faq = computePriority(finding({ estimatedScoreImpact: 15, estimatedMinutes: 45 }));
    expect(crawler).toBeGreaterThan(faq);
  });

  it('clamps into the 1-100 range', () => {
    expect(computePriority(finding({ estimatedScoreImpact: 100, estimatedMinutes: 0 }))).toBeLessThanOrEqual(100);
    expect(computePriority(finding({ estimatedScoreImpact: 0, estimatedMinutes: 999 }))).toBeGreaterThanOrEqual(1);
  });
});

describe('contentGapFinding', () => {
  it('builds a content_gap finding keyed by the prompt', () => {
    const f = contentGapFinding('Solar installation Pai Thailand');
    expect(f.fixType).toBe('content_gap');
    expect(f.dedupKey).toBe('content_gap:solar installation pai thailand');
    expect(f.title).toContain('Solar installation Pai Thailand');
  });

  it('normalizes the dedup key so casing/whitespace do not duplicate', () => {
    expect(contentGapFinding('  SOLAR  ').dedupKey).toBe(contentGapFinding('solar').dedupKey);
  });
});

describe('diffFixes', () => {
  it('creates findings that have no existing pending fix', () => {
    const plan = diffFixes([], [finding({ dedupKey: 'a' }), finding({ dedupKey: 'b' })]);
    expect(plan.create).toHaveLength(2);
    expect(plan.update).toHaveLength(0);
    expect(plan.removeIds).toHaveLength(0);
  });

  it('updates findings that match an existing pending fix', () => {
    const plan = diffFixes([{ id: 'x1', dedupKey: 'a' }], [finding({ dedupKey: 'a' })]);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toEqual([{ id: 'x1', finding: expect.objectContaining({ dedupKey: 'a' }) }]);
    expect(plan.removeIds).toHaveLength(0);
  });

  it('removes pending fixes whose problem no longer appears', () => {
    const plan = diffFixes([{ id: 'x1', dedupKey: 'gone' }], [finding({ dedupKey: 'a' })]);
    expect(plan.create).toHaveLength(1);
    expect(plan.removeIds).toEqual(['x1']);
  });

  it('handles a mix of create / update / remove in one pass', () => {
    const existing = [
      { id: 'keep', dedupKey: 'a' },
      { id: 'stale', dedupKey: 'old' },
    ];
    const findings = [finding({ dedupKey: 'a' }), finding({ dedupKey: 'new' })];
    const plan = diffFixes(existing, findings);
    expect(plan.update.map((u) => u.id)).toEqual(['keep']);
    expect(plan.create.map((c) => c.dedupKey)).toEqual(['new']);
    expect(plan.removeIds).toEqual(['stale']);
  });

  it('does not recreate a finding the user already resolved (completed/skipped)', () => {
    const resolved = new Set(['done-already']);
    const plan = diffFixes([], [finding({ dedupKey: 'done-already' }), finding({ dedupKey: 'fresh' })], resolved);
    expect(plan.create.map((c) => c.dedupKey)).toEqual(['fresh']);
    expect(plan.update).toHaveLength(0);
  });
});
