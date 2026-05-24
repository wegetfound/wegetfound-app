import { and, eq } from 'drizzle-orm';
import { computePriority, diffFixes } from '@wegetfound/audit';
import type { Finding, ExistingFixRef } from '@wegetfound/audit';
import { db } from './client';
import { fixes } from './schema/index';

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
}

const dedupKeyOf = (actionPayload: unknown, fallback: string): string => {
  const key = (actionPayload as { dedupKey?: unknown } | null)?.dedupKey;
  return typeof key === 'string' ? key : fallback;
};

// Reconciles a business's Fix queue with the latest audit findings (§7.5).
// Pending fixes are planned over; completed/skipped/dismissed are left untouched
// so user actions (and the learning from skips) survive every re-audit.
export async function syncFixesForBusiness(
  businessId: string,
  findings: Finding[],
): Promise<SyncResult> {
  const pending = await db
    .select({ id: fixes.id, fixType: fixes.fixType, actionPayload: fixes.actionPayload })
    .from(fixes)
    .where(and(eq(fixes.businessId, businessId), eq(fixes.status, 'pending')));

  const existing: ExistingFixRef[] = pending.map((p) => ({
    id: p.id,
    dedupKey: dedupKeyOf(p.actionPayload, p.fixType),
  }));

  const plan = diffFixes(existing, findings);

  for (const finding of plan.create) {
    await db.insert(fixes).values({
      businessId,
      fixType: finding.fixType,
      priority: computePriority(finding),
      estimatedScoreImpact: finding.estimatedScoreImpact,
      estimatedMinutes: finding.estimatedMinutes,
      title: finding.title,
      description: finding.detail,
      actionPayload: { dedupKey: finding.dedupKey },
    });
  }

  for (const { id, finding } of plan.update) {
    await db
      .update(fixes)
      .set({
        priority: computePriority(finding),
        estimatedScoreImpact: finding.estimatedScoreImpact,
        estimatedMinutes: finding.estimatedMinutes,
        title: finding.title,
        description: finding.detail,
        actionPayload: { dedupKey: finding.dedupKey },
      })
      .where(eq(fixes.id, id));
  }

  for (const id of plan.removeIds) {
    await db.delete(fixes).where(eq(fixes.id, id));
  }

  return {
    created: plan.create.length,
    updated: plan.update.length,
    removed: plan.removeIds.length,
  };
}
