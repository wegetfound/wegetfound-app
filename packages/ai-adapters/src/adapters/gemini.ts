import { GoogleGenAI } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
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

// Gemini via the Google GenAI SDK with Google Search grounding — mirrors what a
// consumer asking Gemini about local businesses would see (§6.4). Citations come
// back as groundingChunks on the candidate's groundingMetadata.
// Falls back to ungrounded generation if the project lacks Search grounding access.
const MODEL = process.env.GEMINI_QUERY_MODEL ?? 'gemini-2.0-flash';

export class GeminiAdapter implements AIEngineAdapter {
  readonly engineId = 'gemini' as const;
  readonly engineName = 'Gemini';
  readonly costPerQuery = 0.008;

  // Lazy: constructed on first query so the registry/server boots without GOOGLE_AI_API_KEY.
  private _client?: GoogleGenAI;
  private get client(): GoogleGenAI {
    if (!this._client) this._client = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
    return this._client;
  }

  async queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse> {
    const located = context.geography ? `${prompt} (near ${context.geography})` : prompt;

    try {
      const response = await this.client.models.generateContent({
        model: MODEL,
        contents: located,
        config: { tools: [{ googleSearch: {} }] },
      });
      return { engineId: this.engineId, raw: response, costUsd: this.costPerQuery };
    } catch (err: unknown) {
      // SDK may surface the HTTP status as .status, .code, or inside the message JSON.
      let status: number | undefined =
        (err as { status?: number })?.status ??
        (err as { code?: number })?.code;
      if (!status) {
        try {
          const body = JSON.parse(err instanceof Error ? err.message : String(err)) as { error?: { code?: number } };
          status = body?.error?.code;
        } catch { /* not JSON */ }
      }

      // 403 = project doesn't have Search grounding; fall back to plain generation.
      if (status === 403) {
        const response = await this.client.models.generateContent({
          model: MODEL,
          contents: located,
        });
        return { engineId: this.engineId, raw: response, costUsd: this.costPerQuery };
      }
      // 429 = rate-limited or quota exceeded.
      if (status === 429) {
        throw new Error('Google AI quota exceeded — add billing at console.cloud.google.com');
      }
      throw err;
    }
  }

  parseResponse(raw: unknown): ParsedResponse {
    const response = raw as GenerateContentResponse;
    const text = response.text ?? '';
    const citations: Citation[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        citations.push({ url: chunk.web.uri, title: chunk.web.title ?? undefined });
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
