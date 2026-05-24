import type { EngineId } from '@wegetfound/shared';

// The adapter contract (CLAUDE.md §6.4). Business logic NEVER imports a concrete
// adapter — it goes through the engineRegistry. Adding an engine is one new file
// implementing AIEngineAdapter + one registry registration.

/** Minimal business identity an adapter needs to detect a mention. Adapters are
 *  decoupled from the DB — callers pass this lightweight shape, not a DB row. */
export interface BusinessRef {
  name: string;
  /** Alternate names / common misspellings to also count as a mention. */
  aliases?: string[];
  websiteUrl?: string;
  city?: string;
}

export interface QueryContext {
  /** City/region the consumer is implicitly searching from. Shapes the prompt + cache key. */
  geography?: string;
  /** Business vertical, used for prompt framing and cache partitioning. */
  vertical?: string;
}

export interface EngineResponse {
  engineId: EngineId;
  /** Raw provider payload, stored for debugging and re-parsing. */
  raw: unknown;
  /** Estimated USD cost of this call, for budget tracking. */
  costUsd: number;
}

export interface Citation {
  url: string;
  title?: string;
}

export interface ParsedResponse {
  /** The assistant's answer text, flattened. */
  text: string;
  citations: Citation[];
}

export interface CompetitorMention {
  name: string;
  context: string;
  citationSource?: string;
}

export interface MentionResult {
  /** Did the target business appear in the answer? */
  mentioned: boolean;
  /** Other businesses named instead (feeds Competitor Ghost, §3.7). */
  competitors: CompetitorMention[];
}

export interface AIEngineAdapter {
  readonly engineId: EngineId;
  readonly engineName: string;
  readonly costPerQuery: number;

  queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse>;
  parseResponse(raw: unknown): ParsedResponse;
  extractCitations(parsed: ParsedResponse): Citation[];
  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult;
}
