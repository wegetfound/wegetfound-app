import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { db, organizationMembers, users, organizations } from '@wegetfound/db';
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
  let jwtPayload: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    userId = String(payload.sub ?? '');
    jwtPayload = payload as Record<string, unknown>;
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
    // Auto-provision: brand-new user has no public.users row, no org, no membership.
    // Create all three now so the request proceeds. This branch only runs once per user
    // (on subsequent requests the membership already exists). §6.3 / identity.ts.
    const rawEmail = (jwtPayload.email as string | undefined) ?? `${userId}@placeholder.local`;
    const localPart = rawEmail.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const suffix = randomBytes(3).toString('hex');
    const slug = `${localPart}-${suffix}`;
    const orgName = `${localPart.charAt(0).toUpperCase()}${localPart.slice(1)}'s workspace`;

    await db.insert(users).values({ id: userId, email: rawEmail, fullName: null }).onConflictDoNothing();

    const [newOrg] = await db
      .insert(organizations)
      .values({ name: orgName, slug, plan: 'free' })
      .returning();

    await db
      .insert(organizationMembers)
      .values({ organizationId: newOrg!.id, userId, role: 'owner' });

    req.auth = { userId, orgId: newOrg!.id };
    return;
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
