import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db, businesses, trackedPrompts, isOverDailyCap, recordAiRunWithCapCheck } from '@wegetfound/db';
import { engineRegistry } from '@wegetfound/ai-adapters';
import { validateUuid, validateString } from '../validation.js';
import { AppError, ErrorCodes } from '../error-handler.js';

// Live prompt-test + tracked-prompt management (§3.3, §7.4). Registered inside
// the auth scope — req.auth is always set. Ownership is always verified before
// any read or write.

type IdParams = { id: string };

// Confirms the business exists AND belongs to the caller's active org.
async function findOwnedBusiness(orgId: string, businessId: string) {
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

// Returns the tracked-prompt id if it exists and its parent business belongs
// to the caller's active org, else null. Mirrors the join pattern in fixes.ts.
async function findOwnedPrompt(orgId: string, promptId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: trackedPrompts.id })
    .from(trackedPrompts)
    .innerJoin(businesses, eq(businesses.id, trackedPrompts.businessId))
    .where(and(eq(trackedPrompts.id, promptId), eq(businesses.organizationId, orgId)))
    .limit(1);
  return row?.id ?? null;
}

type TestBody = { prompt: string };
type SaveBody = { prompt: string };

export async function promptRoutes(app: FastifyInstance): Promise<void> {
  // POST /businesses/:id/prompts/test — live test against all engines, no DB writes.
  // Each engine runs concurrently; individual engine failures never fail the request.
  app.post<{ Params: IdParams; Body: TestBody }>(
    '/businesses/:id/prompts/test',
    async (req, reply) => {
      const { orgId, userId } = req.auth!;

      // Validate business ID
      const bizIdValidation = validateUuid(req.params.id);
      if (!bizIdValidation.ok) {
        return reply.code(400).send({ error: bizIdValidation.error, code: ErrorCodes.VALIDATION_ERROR });
      }

      const biz = await findOwnedBusiness(orgId, bizIdValidation.id);
      if (!biz) {
        return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
      }

      // Validate prompt text
      const promptValidation = validateString(req.body?.prompt, {
        minLength: 1,
        maxLength: 1000,
        field: 'prompt',
      });
      if (!promptValidation.ok) {
        return reply.code(400).send({ error: promptValidation.error, code: ErrorCodes.VALIDATION_ERROR });
      }

      // Enforce the daily AI run cap before spending any money.
      const cap = await isOverDailyCap(orgId);
      if (cap.over) {
        return reply.code(429).send({
          error: `Daily audit limit reached (${cap.capPerDay}/day). Try again tomorrow.`,
          capPerDay: cap.capPerDay,
          runsToday: cap.runsToday,
        });
      }

      const geography =
        biz.city && biz.country ? `${biz.city}, ${biz.country}` : undefined;

      const engines = engineRegistry.all();

      // Run all engines concurrently. Each engine is wrapped in its own try/catch
      // so a missing API key, region block, or "not implemented" error on one
      // engine never fails the entire request — it simply reports as 'unavailable'.
      const results = await Promise.all(
        engines.map(async (engine) => {
          try {
            const response = await engine.queryPrompt(promptValidation.value, { geography });
            const parsed = engine.parseResponse(response.raw);
            const mention = engine.detectBusinessMention(parsed, { name: biz.name });
            return {
              engineId: engine.engineId,
              engineName: engine.engineName,
              status: mention.mentioned ? ('mentioned' as const) : ('absent' as const),
              answerExcerpt: parsed.text.slice(0, 320),
              competitors: mention.competitors,
              citations: parsed.citations.slice(0, 5),
            };
          } catch (err) {
            const msg = process.env.NODE_ENV === 'development'
              ? (err instanceof Error ? err.message : String(err))
              : null;
            return {
              engineId: engine.engineId,
              engineName: engine.engineName,
              status: 'unavailable' as const,
              answerExcerpt: msg,
              competitors: [],
              citations: [],
            };
          }
        }),
      );

      // Record usage with cap enforcement
      const recordResult = await recordAiRunWithCapCheck({
        organizationId: orgId,
        userId,
        businessId: bizIdValidation.id,
        kind: 'prompt.tested',
        engineCalls: results.length,
      });

      if (!recordResult.success) {
        req.log.warn('Failed to record usage event:', recordResult.error);
        // Don't fail the response; the run already happened
      }

      return { prompt: promptValidation.value, results };
    },
  );

  // POST /businesses/:id/prompts — save a tracked prompt.
  app.post<{ Params: IdParams; Body: SaveBody }>(
    '/businesses/:id/prompts',
    async (req, reply) => {
      const { orgId } = req.auth!;

      // Validate business ID
      const bizIdValidation = validateUuid(req.params.id);
      if (!bizIdValidation.ok) {
        return reply.code(400).send({ error: bizIdValidation.error, code: ErrorCodes.VALIDATION_ERROR });
      }

      const biz = await findOwnedBusiness(orgId, bizIdValidation.id);
      if (!biz) {
        return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
      }

      // Validate prompt text
      const promptValidation = validateString(req.body?.prompt, {
        minLength: 1,
        maxLength: 1000,
        field: 'prompt',
      });
      if (!promptValidation.ok) {
        return reply.code(400).send({ error: promptValidation.error, code: ErrorCodes.VALIDATION_ERROR });
      }

      const [prompt] = await db
        .insert(trackedPrompts)
        .values({ businessId: bizIdValidation.id, promptText: promptValidation.value })
        .returning();

      if (!prompt) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to save prompt', 500);
      }

      return reply.code(201).send({ prompt });
    },
  );

  // GET /businesses/:id/prompts — list active tracked prompts, newest first.
  app.get<{ Params: IdParams }>('/businesses/:id/prompts', async (req, reply) => {
    const { orgId } = req.auth!;

    // Validate business ID
    const bizIdValidation = validateUuid(req.params.id);
    if (!bizIdValidation.ok) {
      return reply.code(400).send({ error: bizIdValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const biz = await findOwnedBusiness(orgId, bizIdValidation.id);
    if (!biz) {
      return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
    }

    const prompts = await db
      .select({
        id: trackedPrompts.id,
        promptText: trackedPrompts.promptText,
        isActive: trackedPrompts.isActive,
        createdAt: trackedPrompts.createdAt,
      })
      .from(trackedPrompts)
      .where(
        and(
          eq(trackedPrompts.businessId, biz.id),
          eq(trackedPrompts.isActive, true),
        ),
      )
      .orderBy(desc(trackedPrompts.createdAt));

    return { prompts };
  });

  // DELETE /prompts/:id — hard-delete a tracked prompt the caller owns.
  app.delete<{ Params: IdParams }>('/prompts/:id', async (req, reply) => {
    const { orgId } = req.auth!;

    // Validate prompt ID
    const promptIdValidation = validateUuid(req.params.id);
    if (!promptIdValidation.ok) {
      return reply.code(400).send({ error: promptIdValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const id = await findOwnedPrompt(orgId, promptIdValidation.id);
    if (!id) {
      return reply.code(404).send({ error: 'Prompt not found', code: ErrorCodes.NOT_FOUND });
    }

    await db.delete(trackedPrompts).where(eq(trackedPrompts.id, id));
    return { deleted: true };
  });
}
