import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL;

export interface Business {
  id: string;
  name: string;
  websiteUrl: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
}

export interface Score {
  overallScore: number;
  chatgptScore: number | null;
  perplexityScore: number | null;
  claudeScore: number | null;
  geminiScore: number | null;
  googleAioScore: number | null;
  promptsTested: number;
  promptsWinning: number;
  calculatedAt: string;
  signals: { breakdown?: { multiplier: number } } & Record<string, unknown>;
}

export interface Fix {
  id: string;
  fixType: string;
  priority: number;
  estimatedScoreImpact: number | null;
  estimatedMinutes: number | null;
  title: string;
  description: string;
  status: string;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listBusinesses: () => getJson<{ businesses: Business[] }>('/businesses').then((r) => r.businesses),

  // Score may not exist yet (404) — return null rather than throw.
  getScore: async (businessId: string): Promise<Score | null> => {
    const res = await authedFetch(`/businesses/${businessId}/score`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`score → ${res.status}`);
    return (await res.json() as { score: Score }).score;
  },

  getFixes: (businessId: string) =>
    getJson<{ fixes: Fix[] }>(`/businesses/${businessId}/fixes`).then((r) => r.fixes),

  completeFix: (fixId: string) =>
    authedFetch(`/fixes/${fixId}/complete`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`complete → ${r.status}`);
    }),

  skipFix: (fixId: string) =>
    authedFetch(`/fixes/${fixId}/skip`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`skip → ${r.status}`);
    }),
};
