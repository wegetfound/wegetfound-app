import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db, organizationMembers } from '@wegetfound/db';
import { and, asc, eq } from 'drizzle-orm';

// Auth contract (§9.3): Supabase JWT in Authorization: Bearer <token>.
// The JWT proves identity only (`sub` = user id); the ACTIVE ORG is resolved
// server-side from membership rather than carried as a token claim — so switching
// orgs never requires re-minting a token, and we don't depend on a Supabase custom
// access-token hook. An optional `X-Org-Id` header selects among multiple orgs and
// is always validated against membership. RLS remains the DB boundary; this is
// defense in depth.
//
// Supabase signs with ECC (P-256 / ES256) — verified via the JWKS endpoint so key
// rotation is automatic.

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; orgId: string };
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error('SUPABASE_URL is not set');

// GoTrue serves its JWKS under /auth/v1, not the domain root.
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing bearer token' });
  }
  const token = header.slice('Bearer '.length);

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    userId = String(payload.sub ?? '');
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
  if (!userId) {
    return reply.code(401).send({ error: 'Token missing subject' });
  }

  // Resolve the active org from membership.
  const requested = req.headers['x-org-id'];
  const requestedOrgId = Array.isArray(requested) ? requested[0] : requested;

  const memberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .orderBy(asc(organizationMembers.createdAt));

  if (memberships.length === 0) {
    return reply.code(403).send({ error: 'User belongs to no organization' });
  }

  let orgId: string;
  if (requestedOrgId) {
    const match = memberships.find((m) => m.organizationId === requestedOrgId);
    if (!match) {
      return reply.code(403).send({ error: 'Not a member of the requested organization' });
    }
    orgId = match.organizationId;
  } else {
    orgId = memberships[0]!.organizationId; // default: earliest-joined org
  }

  req.auth = { userId, orgId };
}
