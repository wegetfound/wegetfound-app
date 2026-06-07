import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly: a build without these vars produces a silently broken auth flow.
  throw new Error(
    'Supabase is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time.',
  );
}

// Surface which project the bundle was built against. Invaluable when a deploy
// accidentally ships dev credentials (the magic-link emails then go nowhere).
const projectRef = (() => {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return 'unknown';
  }
})();
console.info(`[supabase] client initialized — project: ${projectRef}`);

export const SUPABASE_PROJECT_REF = projectRef;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
