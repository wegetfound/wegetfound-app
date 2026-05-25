import { eq } from 'drizzle-orm';
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
  // All current fixes for the business — we plan over pending ones, but also need
  // the dedupKeys the user already actioned so we don't resurrect resolved fixes.
  const all = await db
    .select({ id: fixes.id, fixType: fixes.fixType, status: fixes.status, actionPayload: fixes.actionPayload })
    .from(fixes)
    .where(eq(fixes.businessId, businessId));

  const existing: ExistingFixRef[] = [];
  const resolvedKeys = new Set<string>();
  for (const f of all) {
    const key = dedupKeyOf(f.actionPayload, f.fixType);
    if (f.status === 'pending') existing.push({ id: f.id, dedupKey: key });
    else resolvedKeys.add(key); // completed / skipped / dismissed
  }

  const plan = diffFixes(existing, findings, resolvedKeys);

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
