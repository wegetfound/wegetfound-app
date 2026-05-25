import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Load the repo-root .env and OVERRIDE existing process env. The shell/harness can
// inject an empty var (e.g. ANTHROPIC_API_KEY="") that would otherwise shadow the
// real value in .env — Node's --env-file and dotenv-without-override refuse to
// overwrite a var that already exists in the environment, so the empty one wins.
// Object.assign forces our .env values to take precedence. Imported first in
// index.ts so it runs before any module reads process.env.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../../.env');
try {
  Object.assign(process.env, parseEnv(readFileSync(envPath, 'utf8')));
} catch {
  // .env is optional where the host injects env vars directly (e.g. Render).
}
