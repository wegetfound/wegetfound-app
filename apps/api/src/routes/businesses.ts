import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db, businesses, findabilityScores, fixes, trackedPrompts, scoreBusiness, buildDefaultPrompts, isOverDailyCap, recordAiRunWithCapCheck } from '@wegetfound/db';
import { validateString, validateOptionalString, validateOptionalUrl, validateOptionalEmail, validateVertical, validateUuid } from '../validation.js';
import { AppError, ErrorCodes } from '../error-handler.js';

// Authenticated, org-scoped read endpoints (§9.4). Every query filters by the
// active org from the JWT — RLS is the DB boundary, this is defense in depth.
// Registered inside the auth scope, so req.auth is always set here.

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

async function require404<T>(value: T | null, reply: FastifyReply): Promise<T | undefined> {
  if (value === null) {
    reply.code(404).send({ error: 'Not found' });
    return undefined;
  }
  return value;
}

type CreateBusinessBody = {
  name: string;
  websiteUrl?: string;
  vertical?: string;
  category?: string;
  city?: string;
  region?: string;
  country?: string;
  phone?: string;
  email?: string;
};

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  // POST /businesses — create a business in the caller's active org.
  app.post<{ Body: CreateBusinessBody }>('/businesses', async (req, reply) => {
    const { orgId } = req.auth!;
    const { name, websiteUrl, vertical, category, city, region, country, phone, email } = req.body;

    // Validate required name
    const nameValidation = validateString(name, { minLength: 1, maxLength: 200, field: 'name' });
    if (!nameValidation.ok) {
      return reply.code(400).send({ error: nameValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    // Validate optional fields
    const urlValidation = await validateOptionalUrl(websiteUrl);
    if (!urlValidation.ok) {
      return reply.code(400).send({ error: urlValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const categoryValidation = await validateOptionalString(category, { maxLength: 100, field: 'category' });
    if (!categoryValidation.ok) {
      return reply.code(400).send({ error: categoryValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const cityValidation = await validateOptionalString(city, { maxLength: 100, field: 'city' });
    if (!cityValidation.ok) {
      return reply.code(400).send({ error: cityValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const regionValidation = await validateOptionalString(region, { maxLength: 100, field: 'region' });
    if (!regionValidation.ok) {
      return reply.code(400).send({ error: regionValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const countryValidation = await validateOptionalString(country, { maxLength: 100, field: 'country' });
    if (!countryValidation.ok) {
      return reply.code(400).send({ error: countryValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const phoneValidation = await validateOptionalString(phone, { maxLength: 20, field: 'phone' });
    if (!phoneValidation.ok) {
      return reply.code(400).send({ error: phoneValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    const emailValidation = await validateOptionalEmail(email);
    if (!emailValidation.ok) {
      return reply.code(400).send({ error: emailValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    // Validate vertical if provided (optional)
    let validatedVertical: string | undefined = undefined;
    if (vertical !== undefined) {
      const verticalValidation = validateVertical(vertical);
      if (!verticalValidation.ok) {
        return reply.code(400).send({ error: verticalValidation.error, code: ErrorCodes.VALIDATION_ERROR });
      }
      validatedVertical = verticalValidation.vertical;
    }

    const inserted = await db
      .insert(businesses)
      .values({
        organizationId: orgId,
        name: nameValidation.value,
        ...(urlValidation.value !== null && { websiteUrl: urlValidation.value }),
        ...(validatedVertical !== undefined && { vertical: validatedVertical as import('@wegetfound/shared').Vertical }),
        ...(categoryValidation.value !== null && { category: categoryValidation.value }),
        ...(cityValidation.value !== null && { city: cityValidation.value }),
        ...(regionValidation.value !== null && { region: regionValidation.value }),
        ...(countryValidation.value !== null && { country: countryValidation.value }),
        ...(phoneValidation.value !== null && { phone: phoneValidation.value }),
        ...(emailValidation.value !== null && { email: emailValidation.value }),
      })
      .returning();

    const business = inserted[0];
    if (!business) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to create business', 500);
    }

    // Auto-seed default tracked prompts so the PromptTester shows useful starting
    // points and the first audit is never a dead run with a hollow 0 score.
    const defaultPrompts = buildDefaultPrompts({
      name: business.name,
      category: business.category,
      city: business.city,
      country: business.country,
    });
    if (defaultPrompts.length > 0) {
      await db.insert(trackedPrompts).values(
        defaultPrompts.map((promptText) => ({ businessId: business.id, promptText })),
      );
    }

    return reply.code(201).send({ business });
  });

  // GET /businesses — all businesses in the active org.
  app.get('/businesses', async (req: FastifyRequest) => {
    const { orgId } = req.auth!;
    const rows = await db.select().from(businesses).where(eq(businesses.organizationId, orgId));
    return { businesses: rows };
  });

  // GET /businesses/:id
  app.get<{ Params: IdParams }>('/businesses/:id', async (req, reply) => {
    const { orgId } = req.auth!;
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }
    const business = await require404(await findOwnedBusiness(orgId, idValidation.id), reply);
    if (!business) return;
    return { business };
  });

  // GET /businesses/:id/score — latest Findability Score.
  app.get<{ Params: IdParams }>('/businesses/:id/score', async (req, reply) => {
    const { orgId } = req.auth!;
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }
    if (!(await findOwnedBusiness(orgId, idValidation.id))) {
      return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
    }

    const [latest] = await db
      .select()
      .from(findabilityScores)
      .where(eq(findabilityScores.businessId, idValidation.id))
      .orderBy(desc(findabilityScores.calculatedAt))
      .limit(1);

    if (!latest) return reply.code(404).send({ error: 'No score yet — run an audit first.' });
    return { score: latest };
  });

  // GET /businesses/:id/score/history — newest first.
  app.get<{ Params: IdParams }>('/businesses/:id/score/history', async (req, reply) => {
    const { orgId } = req.auth!;
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }
    if (!(await findOwnedBusiness(orgId, idValidation.id))) {
      return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
    }

    const history = await db
      .select()
      .from(findabilityScores)
      .where(eq(findabilityScores.businessId, idValidation.id))
      .orderBy(desc(findabilityScores.calculatedAt))
      .limit(100);
    return { history };
  });

  // GET /businesses/:id/fixes — the Daily Fix queue (pending, highest priority first).
  app.get<{ Params: IdParams }>('/businesses/:id/fixes', async (req, reply) => {
    const { orgId } = req.auth!;
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }
    if (!(await findOwnedBusiness(orgId, idValidation.id))) {
      return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
    }

    const queue = await db
      .select()
      .from(fixes)
      .where(and(eq(fixes.businessId, idValidation.id), eq(fixes.status, 'pending')))
      .orderBy(desc(fixes.priority));
    return { fixes: queue };
  });

  // POST /businesses/:id/audit — run a fresh audit + re-score now (§6.6).
  // Synchronous for v1 (single business, few prompts). When audits get heavier this
  // moves behind a BullMQ queue and returns 202 — the route contract stays the same.
  app.post<{ Params: IdParams }>('/businesses/:id/audit', async (req, reply) => {
    const { orgId, userId } = req.auth!;

    // Validate business ID
    const idValidation = validateUuid(req.params.id);
    if (!idValidation.ok) {
      return reply.code(400).send({ error: idValidation.error, code: ErrorCodes.VALIDATION_ERROR });
    }

    if (!(await findOwnedBusiness(orgId, idValidation.id))) {
      return reply.code(404).send({ error: 'Business not found', code: ErrorCodes.NOT_FOUND });
    }

    // Soft check first (fast gate)
    const cap = await isOverDailyCap(orgId);
    if (cap.over) {
      return reply.code(429).send({
        error: `Daily audit limit reached (${cap.capPerDay}/day). Try again tomorrow.`,
        code: ErrorCodes.RATE_LIMIT,
        capPerDay: cap.capPerDay,
        runsToday: cap.runsToday,
      });
    }

    // Run the audit
    const result = await scoreBusiness(idValidation.id, { onLog: (m) => req.log.info(m) });

    // Record usage with hard cap enforcement (prevents race conditions)
    const engineCalls = (result.promptsTested ?? 0) * (result.liveEngines?.length ?? 0);
    const recordResult = await recordAiRunWithCapCheck({
      organizationId: orgId,
      userId,
      businessId: idValidation.id,
      kind: 'audit.run',
      engineCalls,
    });

    if (!recordResult.success) {
      return reply.code(429).send({
        error: recordResult.error || 'Daily audit limit reached',
        code: ErrorCodes.RATE_LIMIT,
      });
    }

    return {
      overallScore: result.breakdown.overallScore,
      multiplier: result.breakdown.multiplier,
      promptsTested: result.promptsTested,
      promptsWinning: result.promptsWinning,
      liveEngines: result.liveEngines,
      fixQueue: result.fixSync,
    };
  });
}
