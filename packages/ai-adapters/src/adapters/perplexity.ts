import type {
  AIEngineAdapter,
  BusinessRef,
  Citation,
  EngineResponse,
  MentionResult,
  ParsedResponse,
  QueryContext,
} from '../types.js';
import { detectMention } from '../detect.js';

// Perplexity Sonar — an answer engine that's search-native by design, so no tool
// config needed; every answer is grounded with citations (§6.4). OpenAI-compatible
// chat/completions shape plus a top-level search_results/citations array.
const MODEL = process.env.PERPLEXITY_QUERY_MODEL ?? 'sonar';
const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
  search_results?: { title?: string; url?: string }[];
  citations?: string[];
}

export class PerplexityAdapter implements AIEngineAdapter {
  readonly engineId = 'perplexity' as const;
  readonly engineName = 'Perplexity';
  readonly costPerQuery = 0.005;

  async queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set');

    const located = context.geography ? `${prompt} (near ${context.geography})` : prompt;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: located }] }),
    });
    if (!res.ok) {
      throw new Error(`Perplexity API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as PerplexityResponse;
    return { engineId: this.engineId, raw: data, costUsd: this.costPerQuery };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const data = raw as PerplexityResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    const citations: Citation[] = data.search_results?.length
      ? data.search_results
          .filter((r): r is { url: string; title?: string } => typeof r.url === 'string')
          .map((r) => ({ url: r.url, title: r.title }))
      : (data.citations ?? []).map((url) => ({ url }));
    return { text, citations };
  }

  extractCitations(parsed: ParsedResponse): Citation[] {
    return parsed.citations;
  }

  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
    return detectMention(parsed, business);
  }
}
