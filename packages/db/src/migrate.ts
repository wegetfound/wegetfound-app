import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Runs migrations through our own postgres client so prepared statements are
// disabled (required by Supabase's transaction pooler) and SSL is enforced.
// drizzle-kit's own `migrate` can't disable prepares, hence this script.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1, prepare: false, ssl: 'require' });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✓ Migrations applied.');
} catch (err) {
  console.error('✗ Migration failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
