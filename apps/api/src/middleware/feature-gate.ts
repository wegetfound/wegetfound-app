import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { db, organizations } from '@wegetfound/db';
import { eq } from 'drizzle-orm';
import { hasFeature } from '@wegetfound/shared';

/**
 * Middleware to gate features by plan.
 * Usage: app.get('/some-feature', { onRequest: [featureGate('feature-name')] }, handler)
 */
export function featureGate(requiredFeature: string) {
  return async (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
    try {
      // Assumes auth middleware has already set request.auth
      const orgId = request.auth?.orgId as string | undefined;
      if (!orgId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });

      if (!org) {
        return reply.code(404).send({ error: 'Organization not found' });
      }

      // Check if plan has the required feature
      if (!hasFeature(org.plan as any, requiredFeature)) {
        // Infer which plan is required (find first plan that has this feature)
        const planNames: ('starter' | 'growth' | 'agency' | 'enterprise')[] = [
          'starter',
          'growth',
          'agency',
          'enterprise',
        ];
        let requiredPlan = 'growth';
        for (const plan of planNames) {
          if (hasFeature(plan, requiredFeature)) {
            requiredPlan = plan;
            break;
          }
        }

        return reply.code(403).send({
          error: 'Feature not available on your plan',
          currentPlan: org.plan,
          requiredPlan,
          feature: requiredFeature,
        });
      }

      done();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Feature gate error:', message);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  };
}
