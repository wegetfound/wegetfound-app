import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify } from 'jose';
import { db, organizationMembers } from '@wegetfound/db';
import { and, eq } from 'drizzle-orm';

// Auth contract (§9.3): Supabase JWT in Authorization: Bearer <token>.
// The JWT carries `sub` (user_id) and a custom `active_org_id` claim. We verify
// the signature AND do an explicit org-membership check at the app layer — RLS
// is the DB boundary, this is defense in depth.

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; orgId: string };
  }
}

const secret = () => new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? '');

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing bearer token' });
  }
  const token = header.slice('Bearer '.length);

  let userId: string;
  let orgId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = String(payload.sub);
    orgId = String(payload.active_org_id ?? '');
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
  if (!userId || !orgId) {
    return reply.code(401).send({ error: 'Token missing user or active organization' });
  }

  const membership = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (membership.length === 0) {
    return reply.code(403).send({ error: 'Not a member of the active organization' });
  }

  req.auth = { userId, orgId };
}
