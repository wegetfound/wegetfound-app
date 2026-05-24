import type { Finding } from './types.js';

// Pure Fix-queue planning (§7.5). No DB here — the db package applies the plan.

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// Priority 1-100, higher surfaces first. High score-impact and low effort both
// raise priority, so "big quick wins" (e.g. unblocking AI crawlers) rise to the top.
export function computePriority(finding: Finding): number {
  return clamp(Math.round(finding.estimatedScoreImpact * 2 - finding.estimatedMinutes / 3), 1, 100);
}

// A content gap: an AI assistant doesn't surface the business for a tracked prompt.
// This is the core product signal — turns "you're invisible" into a concrete page to write.
export function contentGapFinding(promptText: string): Finding {
  return {
    dedupKey: `content_gap:${promptText.toLowerCase().trim()}`,
    fixType: 'content_gap',
    title: `AI assistants don't recommend you for "${promptText}"`,
    detail: `When someone asks an AI assistant "${promptText}", your business isn't mentioned. Publishing a focused, genuinely helpful page that answers this question is how you enter the conversation.`,
    estimatedScoreImpact: 20,
    estimatedMinutes: 60,
  };
}

// What the Fix queue already holds for a business (the minimum the planner needs).
export interface ExistingFixRef {
  id: string;
  dedupKey: string;
}

export interface FixPlan {
  create: Finding[];
  update: { id: string; finding: Finding }[];
  removeIds: string[];
}

// Reconcile current findings against existing pending fixes:
//  - finding with no matching pending fix  → create
//  - finding with a matching pending fix   → update (impact/copy may have changed)
//  - pending fix no longer in findings     → remove (the problem was resolved)
// Callers pass ONLY user-untouched (pending) fixes as `existing`; completed/skipped/
// dismissed fixes are never planned over, preserving user intent and learning.
export function diffFixes(existing: ExistingFixRef[], findings: Finding[]): FixPlan {
  const existingByKey = new Map(existing.map((e) => [e.dedupKey, e]));
  const currentKeys = new Set(findings.map((f) => f.dedupKey));

  const create: Finding[] = [];
  const update: { id: string; finding: Finding }[] = [];

  for (const finding of findings) {
    const match = existingByKey.get(finding.dedupKey);
    if (match) update.push({ id: match.id, finding });
    else create.push(finding);
  }

  const removeIds = existing.filter((e) => !currentKeys.has(e.dedupKey)).map((e) => e.id);

  return { create, update, removeIds };
}
