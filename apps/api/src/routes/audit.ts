import type { FastifyInstance } from 'fastify';
import { engineRegistry } from '@wegetfound/ai-adapters';

// Public free-audit endpoint (§9.1, §10.1). No auth. This is the top of the
// funnel — anonymous users run one audit, then we capture their email.
// v1 skeleton: validates input and returns the engine list it WILL query.
// Real async audit (queue → all 5 engines → score) lands in Weeks 3–6.
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { businessName?: string; websiteUrl?: string } }>(
    '/audit/free',
    async (req, reply) => {
      const { businessName, websiteUrl } = req.body ?? {};
      if (!businessName && !websiteUrl) {
        return reply.code(400).send({ error: 'Provide a business name or website.' });
      }
      return {
        status: 'queued',
        target: { businessName, websiteUrl },
        engines: engineRegistry.all().map((e) => ({ id: e.engineId, name: e.engineName })),
        note: 'Audit pipeline lands in Weeks 3–6 (§12).',
      };
    },
  );
}
