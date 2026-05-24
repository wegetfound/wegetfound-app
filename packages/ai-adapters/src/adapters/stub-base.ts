import type { EngineId } from '@wegetfound/shared';
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

// Base for not-yet-built adapters. parse/extract/detect work generically off a
// { text, citations } payload; only queryPrompt is unimplemented. Weeks 3–4 fill
// these in one at a time using ClaudeAdapter as the template (§12).
export abstract class StubAdapter implements AIEngineAdapter {
  abstract readonly engineId: EngineId;
  abstract readonly engineName: string;
  abstract readonly costPerQuery: number;

  async queryPrompt(_prompt: string, _context: QueryContext): Promise<EngineResponse> {
    throw new Error(`${this.engineName} adapter not implemented yet (§12, Weeks 3–4)`);
  }

  parseResponse(raw: unknown): ParsedResponse {
    const r = (raw ?? {}) as Partial<ParsedResponse>;
    return { text: r.text ?? '', citations: r.citations ?? [] };
  }

  extractCitations(parsed: ParsedResponse): Citation[] {
    return parsed.citations;
  }

  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
    return detectMention(parsed, business);
  }
}
