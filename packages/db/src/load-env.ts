import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preload script: load repo-root .env with override so shell empty-vars don't shadow.
// Import this FIRST via tsx --import flag or import at top of scripts.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env'), override: true });
