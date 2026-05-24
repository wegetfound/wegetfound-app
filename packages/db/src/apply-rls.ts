import { readFileSync } from 'node:fs';
import postgres from 'postgres';

// Applies the Row-Level Security policies (rls.sql) after migrations. Idempotent-ish:
// re-running errors only if a policy already exists — drop-and-recreate handled by
// editing rls.sql when policies change. Run with: pnpm --filter @wegetfound/db rls
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const sqlText = readFileSync(new URL('./rls.sql', import.meta.url), 'utf8');
const sql = postgres(connectionString, { max: 1, prepare: false, ssl: 'require' });

try {
  await sql.unsafe(sqlText);
  console.log('✓ RLS policies applied.');
} catch (err) {
  console.error('✗ Failed to apply RLS policies:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
