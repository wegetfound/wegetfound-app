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
const MODEL = process.env.GEMINI_QUERY_MODEL ?? 'gemini-2.5-flash';

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
    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: located,
      config: { tools: [{ googleSearch: {} }] },
    });
    return { engineId: this.engineId, raw: response, costUsd: this.costPerQuery };
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
