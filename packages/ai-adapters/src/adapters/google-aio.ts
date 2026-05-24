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

// Google AI Overviews via SerpAPI (§6.4). Google has no API for AI Overviews, so
// SerpAPI scrapes the SERP. The overview sometimes arrives as a page_token that
// must be resolved with a second request (engine=google_ai_overview).
const ENDPOINT = 'https://serpapi.com/search';

interface SerpTextBlock {
  type?: string;
  snippet?: string;
  list?: SerpTextBlock[];
  text_blocks?: SerpTextBlock[];
}

interface SerpAiOverview {
  text_blocks?: SerpTextBlock[];
  references?: { title?: string; link?: string }[];
  page_token?: string;
}

interface SerpResponse {
  ai_overview?: SerpAiOverview;
}

// Recursively flatten nested text_blocks (paragraph snippets, list items) into one string.
function flattenBlocks(blocks: SerpTextBlock[] | undefined): string {
  if (!blocks) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.snippet) parts.push(b.snippet);
    if (b.list) parts.push(flattenBlocks(b.list));
    if (b.text_blocks) parts.push(flattenBlocks(b.text_blocks));
  }
  return parts.join(' ');
}

export class GoogleAioAdapter implements AIEngineAdapter {
  readonly engineId = 'google_aio' as const;
  readonly engineName = 'Google AI Overviews';
  readonly costPerQuery = 0.02;

  async queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error('SERPAPI_KEY is not set');

    const q = context.geography ? `${prompt} ${context.geography}` : prompt;
    const search = new URL(ENDPOINT);
    search.searchParams.set('engine', 'google');
    search.searchParams.set('q', q);
    search.searchParams.set('api_key', apiKey);

    const res = await fetch(search);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
    let data = (await res.json()) as SerpResponse;

    // AI Overview deferred: resolve the page_token with a second call.
    const token = data.ai_overview?.page_token;
    if (token && !data.ai_overview?.text_blocks) {
      const follow = new URL(ENDPOINT);
      follow.searchParams.set('engine', 'google_ai_overview');
      follow.searchParams.set('page_token', token);
      follow.searchParams.set('api_key', apiKey);
      const followRes = await fetch(follow);
      if (followRes.ok) data = (await followRes.json()) as SerpResponse;
    }

    return { engineId: this.engineId, raw: data, costUsd: this.costPerQuery };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const data = raw as SerpResponse;
    const ai = data.ai_overview;
    const text = flattenBlocks(ai?.text_blocks);
    const citations: Citation[] = (ai?.references ?? [])
      .filter((r): r is { link: string; title?: string } => typeof r.link === 'string')
      .map((r) => ({ url: r.link, title: r.title }));
    return { text, citations };
  }

  extractCitations(parsed: ParsedResponse): Citation[] {
    return parsed.citations;
  }

  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
    return detectMention(parsed, business);
  }
}
