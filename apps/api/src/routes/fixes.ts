import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db, fixes, businesses } from '@wegetfound/db';
import type { FixStatus } from '@wegetfound/shared';

// Fix-queue actions (§9.4, §7.5). Skips are tracked, not discarded — we learn
// what users avoid. Ownership is verified by joining the fix to its business's org.

type IdParams = { id: string };

// Returns the fix id if it exists and belongs to the caller's active org, else null.
async function findOwnedFix(orgId: string, fixId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: fixes.id })
    .from(fixes)
    .innerJoin(businesses, eq(businesses.id, fixes.businessId))
    .where(and(eq(fixes.id, fixId), eq(businesses.organizationId, orgId)))
    .limit(1);
  return row?.id ?? null;
}

async function transition(app: FastifyInstance, path: string, status: FixStatus): Promise<void> {
  app.post<{ Params: IdParams }>(path, async (req, reply) => {
    const { orgId } = req.auth!;
    const id = await findOwnedFix(orgId, req.params.id);
    if (!id) return reply.code(404).send({ error: 'Not found' });

    const [updated] = await db
      .update(fixes)
      .set({ status, completedAt: status === 'completed' ? new Date() : null })
      .where(eq(fixes.id, id))
      .returning();
    return { fix: updated };
  });
}

export async function fixRoutes(app: FastifyInstance): Promise<void> {
  await transition(app, '/fixes/:id/complete', 'completed');
  await transition(app, '/fixes/:id/skip', 'skipped');
}
