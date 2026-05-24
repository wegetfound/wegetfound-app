import OpenAI from 'openai';
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

// ChatGPT via the OpenAI Responses API with the web_search tool — mirrors what a
// consumer asking ChatGPT (with search) about local businesses would see (§6.4).
const MODEL = process.env.CHATGPT_QUERY_MODEL ?? 'gpt-4o';

export class ChatGPTAdapter implements AIEngineAdapter {
  readonly engineId = 'chatgpt' as const;
  readonly engineName = 'ChatGPT';
  readonly costPerQuery = 0.01;

  // Lazy: constructed on first query so the registry/server boots without OPENAI_API_KEY.
  private _client?: OpenAI;
  private get client(): OpenAI {
    if (!this._client) this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._client;
  }

  async queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse> {
    const located = context.geography ? `${prompt} (near ${context.geography})` : prompt;
    const response = await this.client.responses.create({
      model: MODEL,
      input: located,
      tools: [{ type: 'web_search_preview' }],
    });
    return { engineId: this.engineId, raw: response, costUsd: this.costPerQuery };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const response = raw as OpenAI.Responses.Response;
    let text = '';
    const citations: Citation[] = [];
    for (const item of response.output ?? []) {
      if (item.type !== 'message') continue;
      for (const block of item.content) {
        if (block.type !== 'output_text') continue;
        text += block.text;
        for (const a of block.annotations ?? []) {
          if (a.type === 'url_citation' && typeof a.url === 'string') {
            citations.push({ url: a.url, title: a.title ?? undefined });
          }
        }
      }
    }
    return { text, citations };
  }

  extractCitations(parsed: ParsedResponse): Citation[] {
    return parsed.citations;
  }

  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
    return detectMention(parsed, business);
  }
}
