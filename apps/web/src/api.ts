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

// Retry logic for handling cold-start timeouts on free-tier hosting
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout, generous for cold-start

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout((error as any)?.timeoutId);

      if (attempt === maxAttempts) throw error;

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to fetch after retries');
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return fetchWithRetry(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authedFetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface MeResponse {
  user: { id: string; email: string; fullName: string };
  organization: { id: string; name: string; slug: string; plan: string };
}

export interface EngineTestResult {
  engineId: string;
  engineName: string;
  status: 'mentioned' | 'absent' | 'unavailable';
  answerExcerpt: string | null;
  competitors: { name: string; context: string }[];
  citations: { url: string; title?: string }[];
}

export interface TrackedPrompt {
  id: string;
  promptText: string;
  isActive: boolean;
  createdAt: string;
}

export const api = {
  getMe: () => getJson<MeResponse>('/me'),

  testPrompt: (businessId: string, prompt: string): Promise<{ prompt: string; results: EngineTestResult[] }> =>
    authedFetch(`/businesses/${businessId}/prompts/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`testPrompt → ${res.status}`);
      return res.json() as Promise<{ prompt: string; results: EngineTestResult[] }>;
    }),

  addTrackedPrompt: (businessId: string, prompt: string): Promise<TrackedPrompt> =>
    authedFetch(`/businesses/${businessId}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`addTrackedPrompt → ${res.status}`);
      return (await res.json() as { prompt: TrackedPrompt }).prompt;
    }),

  listTrackedPrompts: (businessId: string): Promise<TrackedPrompt[]> =>
    getJson<{ prompts: TrackedPrompt[] }>(`/businesses/${businessId}/prompts`).then((r) => r.prompts),

  deleteTrackedPrompt: (promptId: string): Promise<void> =>
    authedFetch(`/prompts/${promptId}`, { method: 'DELETE' }).then((res) => {
      if (!res.ok) throw new Error(`deleteTrackedPrompt → ${res.status}`);
    }),

  createBusiness: (input: {
    name: string;
    websiteUrl?: string;
    vertical?: string;
    category?: string;
    city?: string;
    country?: string;
  }): Promise<Business> =>
    authedFetch('/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`createBusiness → ${res.status}`);
      return (await res.json() as { business: Business }).business;
    }),

  getScoreHistory: (businessId: string): Promise<Score[]> =>
    getJson<{ history: Score[] }>(`/businesses/${businessId}/score/history`).then((r) => r.history),

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

  // Runs a fresh audit + re-score now. Synchronous on the server (can take ~30-45s).
  triggerAudit: (businessId: string) =>
    authedFetch(`/businesses/${businessId}/audit`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`audit → ${r.status}`);
      return r.json() as Promise<{ overallScore: number }>;
    }),

  completeFix: (fixId: string) =>
    authedFetch(`/fixes/${fixId}/complete`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`complete → ${r.status}`);
    }),

  skipFix: (fixId: string) =>
    authedFetch(`/fixes/${fixId}/skip`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`skip → ${r.status}`);
    }),
};
