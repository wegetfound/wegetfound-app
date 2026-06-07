import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db, fixes, businesses } from '@wegetfound/db';
import type { FixStatus } from '@wegetfound/shared';
import { validateUuid } from '../validation.js';
import { AppError, ErrorCodes } from '../error-handler.js';

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

    // Validate ID is a valid UUID
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const id = await findOwnedFix(orgId, idValidation.id);
    if (!id) {
      return reply.code(404).send({ error: 'Fix not found', code: ErrorCodes.NOT_FOUND });
    }

    const [updated] = await db
      .update(fixes)
      .set({ status, completedAt: status === 'completed' ? new Date() : null })
      .where(eq(fixes.id, id))
      .returning();

    if (!updated) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to update fix', 500);
    }

    return { fix: updated };
  });
}

export async function fixRoutes(app: FastifyInstance): Promise<void> {
  await transition(app, '/fixes/:id/complete', 'completed');
  await transition(app, '/fixes/:id/skip', 'skipped');
}
