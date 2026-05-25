import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, users, organizations } from '@wegetfound/db';

// Current user profile + active organization (§9.4).
// Registered inside the auth scope, so req.auth is always set here.

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // GET /me — returns the authenticated user's profile and active organization.
  app.get('/me', async (req, reply) => {
    const { userId, orgId } = req.auth!;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!user || !organization) {
      return reply.code(404).send({ error: 'Profile not found.' });
    }

    return { user, organization };
  });
}
