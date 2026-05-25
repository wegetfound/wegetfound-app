import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db, businesses, findabilityScores, fixes, trackedPrompts, scoreBusiness, buildDefaultPrompts } from '@wegetfound/db';

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

    if (!name?.trim()) {
      return reply.code(400).send({ error: 'Business name is required.' });
    }

    const inserted = await db
      .insert(businesses)
      .values({
        organizationId: orgId,
        name: name.trim(),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(vertical !== undefined && { vertical: vertical as import('@wegetfound/shared').Vertical }),
        ...(category !== undefined && { category }),
        ...(city !== undefined && { city }),
        ...(region !== undefined && { region }),
        ...(country !== undefined && { country }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
      })
      .returning();

    const business = inserted[0];
    if (!business) return reply.code(500).send({ error: 'Failed to create business.' });

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
    const business = await require404(await findOwnedBusiness(orgId, req.params.id), reply);
    if (!business) return;
    return { business };
  });

  // GET /businesses/:id/score — latest Findability Score.
  app.get<{ Params: IdParams }>('/businesses/:id/score', async (req, reply) => {
    const { orgId } = req.auth!;
    if (!(await findOwnedBusiness(orgId, req.params.id))) return reply.code(404).send({ error: 'Not found' });

    const [latest] = await db
      .select()
      .from(findabilityScores)
      .where(eq(findabilityScores.businessId, req.params.id))
      .orderBy(desc(findabilityScores.calculatedAt))
      .limit(1);

    if (!latest) return reply.code(404).send({ error: 'No score yet — run an audit first.' });
    return { score: latest };
  });

  // GET /businesses/:id/score/history — newest first.
  app.get<{ Params: IdParams }>('/businesses/:id/score/history', async (req, reply) => {
    const { orgId } = req.auth!;
    if (!(await findOwnedBusiness(orgId, req.params.id))) return reply.code(404).send({ error: 'Not found' });

    const history = await db
      .select()
      .from(findabilityScores)
      .where(eq(findabilityScores.businessId, req.params.id))
      .orderBy(desc(findabilityScores.calculatedAt))
      .limit(100);
    return { history };
  });

  // GET /businesses/:id/fixes — the Daily Fix queue (pending, highest priority first).
  app.get<{ Params: IdParams }>('/businesses/:id/fixes', async (req, reply) => {
    const { orgId } = req.auth!;
    if (!(await findOwnedBusiness(orgId, req.params.id))) return reply.code(404).send({ error: 'Not found' });

    const queue = await db
      .select()
      .from(fixes)
      .where(and(eq(fixes.businessId, req.params.id), eq(fixes.status, 'pending')))
      .orderBy(desc(fixes.priority));
    return { fixes: queue };
  });

  // POST /businesses/:id/audit — run a fresh audit + re-score now (§6.6).
  // Synchronous for v1 (single business, few prompts). When audits get heavier this
  // moves behind a BullMQ queue and returns 202 — the route contract stays the same.
  app.post<{ Params: IdParams }>('/businesses/:id/audit', async (req, reply) => {
    const { orgId } = req.auth!;
    if (!(await findOwnedBusiness(orgId, req.params.id))) return reply.code(404).send({ error: 'Not found' });

    const result = await scoreBusiness(req.params.id, { onLog: (m) => req.log.info(m) });
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
