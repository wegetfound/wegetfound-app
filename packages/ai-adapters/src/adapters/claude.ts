import Anthropic from '@anthropic-ai/sdk';
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

// REFERENCE IMPLEMENTATION (§6.4). The other four adapters mirror this shape.
// We query Claude with web search enabled to mimic what a real consumer asking
// Claude about local businesses would see, then detect whether the business is named.

const MODEL = process.env.CLAUDE_QUERY_MODEL ?? 'claude-sonnet-4-6';

export class ClaudeAdapter implements AIEngineAdapter {
  readonly engineId = 'claude' as const;
  readonly engineName = 'Claude';
  readonly costPerQuery = 0.015;

  // Lazy: only constructed on first query, so the registry can load (and the
  // server can boot) before ANTHROPIC_API_KEY is configured.
  private _client?: Anthropic;
  private get client(): Anthropic {
    if (!this._client) this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return this._client;
  }

  async queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse> {
    const located = context.geography ? `${prompt} (near ${context.geography})` : prompt;
    const message = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: located }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    });
    return { engineId: this.engineId, raw: message, costUsd: this.costPerQuery };
  }

  parseResponse(raw: unknown): ParsedResponse {
    const message = raw as Anthropic.Message;
    let text = '';
    const citations: Citation[] = [];
    for (const block of message.content ?? []) {
      if (block.type === 'text') {
        text += block.text;
        for (const c of block.citations ?? []) {
          if ('url' in c && typeof c.url === 'string') {
            citations.push({ url: c.url, title: 'title' in c ? c.title ?? undefined : undefined });
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
