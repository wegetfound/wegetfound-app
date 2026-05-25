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
// Falls back to Chat Completions (no live search) when the Responses API is quota-
// limited (429) or unavailable, so the engine still returns a response.
const MODEL = process.env.CHATGPT_QUERY_MODEL ?? 'gpt-4o-mini';

type ChatGPTRaw =
  | { api: 'responses'; data: OpenAI.Responses.Response }
  | { api: 'chat'; data: OpenAI.Chat.Completions.ChatCompletion };

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

    try {
      const response = await this.client.responses.create({
        model: MODEL,
        input: located,
        tools: [{ type: 'web_search_preview' }],
      });
      const raw: ChatGPTRaw = { api: 'responses', data: response };
      return { engineId: this.engineId, raw, costUsd: this.costPerQuery };
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // 429/403 = quota or billing on the Responses (search) endpoint.
      // Fall back to plain chat completions — cheaper, no live search.
      // If that also fails (same account quota), wrap into a cleaner error.
      if (status === 429 || status === 403) {
        try {
          const completion = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: located }],
          });
          const raw: ChatGPTRaw = { api: 'chat', data: completion };
          return { engineId: this.engineId, raw, costUsd: 0.0001 };
        } catch {
          throw new Error('OpenAI quota exceeded — add billing credits at platform.openai.com');
        }
      }
      throw err;
    }
  }

  parseResponse(raw: unknown): ParsedResponse {
    const r = raw as ChatGPTRaw;

    if (r?.api === 'chat') {
      const text = r.data.choices?.[0]?.message?.content ?? '';
      return { text, citations: [] };
    }

    // Responses API path (with or without the wrapper for backward compat).
    const response = (r?.api === 'responses' ? r.data : raw) as OpenAI.Responses.Response;
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
