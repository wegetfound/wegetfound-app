// The 5 AI engines and their Findability Score weights (CLAUDE.md §8.1).
// Adding an engine = add it here + one adapter file + one registry registration (§6.4).

export const ENGINE_IDS = ['chatgpt', 'perplexity', 'claude', 'gemini', 'google_aio'] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export interface EngineMeta {
  id: EngineId;
  /** Display name. Never abbreviated, never grouped as "LLMs" (§5.3). */
  name: string;
  /** Weight in the overall Findability Score. Must sum to 1.0 across all engines. */
  weight: number;
}

export const ENGINES: Record<EngineId, EngineMeta> = {
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', weight: 0.25 },
  perplexity: { id: 'perplexity', name: 'Perplexity', weight: 0.2 },
  claude: { id: 'claude', name: 'Claude', weight: 0.15 },
  gemini: { id: 'gemini', name: 'Gemini', weight: 0.2 },
  google_aio: { id: 'google_aio', name: 'Google AI Overviews', weight: 0.2 },
};

export const ENGINE_LIST: EngineMeta[] = ENGINE_IDS.map((id) => ENGINES[id]);
