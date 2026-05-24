import './load-env';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { users, organizations, organizationMembers } from './schema/index';

// Provisions a real Supabase Auth user for the founder and links it to the seeded
// Pai org, so a genuine login resolves to real data. public.users.id MUST equal
// the Supabase auth uid (the JWT `sub`) — that's the integration contract (§7.1).
// Run once: pnpm --filter @wegetfound/db provision-auth

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

const EMAIL = 'junglelivingpai@protonmail.com';
const adminHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function findAuthUserByEmail(email: string): Promise<string | null> {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: adminHeaders });
  if (!res.ok) throw new Error(`admin list users ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { users?: { id: string; email?: string }[] };
  return data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function createAuthUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) {
    const data = (await res.json()) as { id: string };
    return data.id;
  }
  // Already exists → fetch the existing id.
  const existing = await findAuthUserByEmail(email);
  if (existing) return existing;
  throw new Error(`create auth user ${res.status}: ${await res.text()}`);
}

// Always (re)set the password so the printed dev credential is guaranteed valid.
async function setPassword(uid: string, password: string): Promise<void> {
  const res = await fetch(`${url}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`set password ${res.status}: ${await res.text()}`);
}

async function run() {
  const password = `Dev-${randomBytes(9).toString('base64url')}`;

  const uid = await createAuthUser(EMAIL, password);
  await setPassword(uid, password);
  console.log(`Supabase auth user: ${uid} (${EMAIL})`);

  // public.users.id must equal the auth uid. The seed created a placeholder user
  // with the same email but a fixed id — replace it with the real auth-backed one.
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (existing && existing.id !== uid) {
    await db.delete(organizationMembers).where(eq(organizationMembers.userId, existing.id));
    await db.delete(users).where(eq(users.id, existing.id));
    console.log(`Replaced placeholder user ${existing.id} with auth uid.`);
  }

  await db
    .insert(users)
    .values({ id: uid, email: EMAIL, fullName: 'Founder' })
    .onConflictDoNothing();

  // Link to the seeded Pai org as owner.
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, 'pai-living')).limit(1);
  if (!org) throw new Error('Pai org not found — run the seed first.');

  await db
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: uid, role: 'owner' })
    .onConflictDoNothing();

  console.log(`Linked to org "${org.name}" (${org.id}) as owner.`);
  console.log(`\n--- DEV LOGIN (change in production) ---`);
  console.log(`email:    ${EMAIL}`);
  console.log(`password: ${password}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
