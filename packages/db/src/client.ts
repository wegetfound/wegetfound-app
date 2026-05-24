import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Single shared connection pool. System jobs use the service-role connection
// which bypasses RLS — those call sites must be flagged in PR review (§7.10).
// prepare:false is required by Supabase's transaction pooler (PgBouncer); ssl is
// required by Supabase. Port 5432 is blocked on some networks, so we use the
// transaction pooler (6543) — see .env.
const queryClient = postgres(connectionString, { max: 10, prepare: false, ssl: 'require' });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
export { schema };
