# AI Adapter Layer

The adapter layer provides a single, uniform interface over five heterogeneous AI engine APIs so that business logic never imports a concrete provider and one engine failing never fails the whole request. Adding or replacing an engine is a one-file change plus one registry line.

Sources: `packages/ai-adapters/src/`, `packages/shared/src/engines.ts`, `packages/db/src/score-business.ts`, `apps/api/src/routes/prompts.ts`.

---

## 1. The Adapter Contract

Every engine adapter implements the `AIEngineAdapter` interface defined in `packages/ai-adapters/src/types.ts`:

```typescript
interface AIEngineAdapter {
  readonly engineId: EngineId;           // one of the five canonical IDs
  readonly engineName: string;           // display name, never abbreviated
  readonly costPerQuery: number;         // estimated USD cost per call

  queryPrompt(prompt: string, context: QueryContext): Promise<EngineResponse>;
  parseResponse(raw: unknown): ParsedResponse;
  extractCitations(parsed: ParsedResponse): Citation[];
  detectBusinessMention(parsed: ParsedResponse, business: BusinessRef): MentionResult;
}
```

Supporting types (all in `types.ts`):

| Type | Fields |
|---|---|
| `QueryContext` | `geography?: string`, `vertical?: string` |
| `EngineResponse` | `engineId: EngineId`, `raw: unknown`, `costUsd: number` |
| `ParsedResponse` | `text: string`, `citations: Citation[]` |
| `Citation` | `url: string`, `title?: string` |
| `MentionResult` | `mentioned: boolean`, `competitors: CompetitorMention[]` |
| `CompetitorMention` | `name: string`, `context: string`, `citationSource?: string` |
| `BusinessRef` | `name: string`, `aliases?: string[]`, `websiteUrl?: string`, `city?: string` |

`EngineId` is a union of the five string literals in `packages/shared/src/engines.ts`. `BusinessRef` is a lightweight shape decoupled from the DB — callers pass it; adapters never touch ORM types.

---

## 2. The Registry

`packages/ai-adapters/src/registry.ts` exports a singleton `engineRegistry`.

```typescript
class EngineRegistry {
  register(adapter: AIEngineAdapter): void   // keyed by adapter.engineId
  get(engineId: EngineId): AIEngineAdapter   // throws if engine not registered
  all(): AIEngineAdapter[]                   // canonical ENGINE_IDS order from shared/engines.ts
}
export const engineRegistry = new EngineRegistry();
```

All five adapters are registered at module load time in `registry.ts`. Canonical order is defined by `ENGINE_IDS` in `packages/shared/src/engines.ts`:

```
['chatgpt', 'perplexity', 'claude', 'gemini', 'google_aio']
```

Consumers call `engineRegistry.all()` to iterate every engine (`score-business.ts`, `prompts.ts`) or `engineRegistry.get(id)` for a specific engine. Business logic never imports a concrete adapter class.

---

## 3. Per-Engine Reference

| Engine id | Class | Default model | Model env var | API endpoint | Auth env var | Notes |
|---|---|---|---|---|---|---|
| `chatgpt` | `ChatGPTAdapter` | `gpt-4o-mini` | `CHATGPT_QUERY_MODEL` | OpenAI SDK (Responses API + Chat Completions fallback) | `OPENAI_API_KEY` | Primary path uses `web_search_preview` tool; fallback to plain Chat Completions on 429/403 |
| `perplexity` | `PerplexityAdapter` | `sonar` | `PERPLEXITY_QUERY_MODEL` | `https://api.perplexity.ai/chat/completions` | `PERPLEXITY_API_KEY` | Checked and thrown at `queryPrompt` call time if missing |
| `claude` | `ClaudeAdapter` | `claude-sonnet-4-6` | `CLAUDE_QUERY_MODEL` | Anthropic SDK (`messages.create`) | `ANTHROPIC_API_KEY` | Reference implementation; web_search tool (`web_search_20250305`, max_uses: 3), 1024 max tokens |
| `gemini` | `GeminiAdapter` | `gemini-2.0-flash` | `GEMINI_QUERY_MODEL` | Google GenAI SDK (`models.generateContent`) | `GOOGLE_AI_API_KEY` | Google Search grounding tool; falls back to ungrounded generation on 403 |
| `google_aio` | `GoogleAioAdapter` | n/a (no model) | — | `https://serpapi.com/search` | `SERPAPI_KEY` | SerpAPI scrape of Google AI Overviews; two-call pattern if `page_token` is returned without `text_blocks` |

`CHATGPT_QUERY_MODEL`, `CLAUDE_QUERY_MODEL`, `GEMINI_QUERY_MODEL`, and `PERPLEXITY_QUERY_MODEL` all fall back to their defaults if unset; the adapters use `process.env.VAR ?? 'default'`. `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, and `ANTHROPIC_API_KEY` are read lazily (on first `queryPrompt` call) so the registry and server boot without them configured.

---

## 4. Response Parsing

Every adapter's `parseResponse(raw)` converts the raw provider payload stored in `EngineResponse.raw` into `ParsedResponse { text, citations }`. Extraction varies by provider:

**ChatGPT** (`chatgpt.ts`): Two paths on a tagged union (`{ api: 'responses' | 'chat', data }`). Responses API path iterates `response.output[]` for `type === 'message'` items, then `content[]` for `type === 'output_text'` blocks; text is concatenated and `url_citation` annotations become `Citation` objects. Chat Completions path reads `choices[0].message.content`; citations are always `[]`.

**Perplexity** (`perplexity.ts`): Text from `choices[0].message.content`. Citations prefer `search_results[]` (mapped to `{ url, title }`); falls back to `citations[]` (array of bare URL strings) if `search_results` is absent.

**Claude** (`claude.ts`): Iterates `message.content[]` for `type === 'text'` blocks; text is concatenated. `block.citations[]` items with a `url` field become `Citation` objects.

**Gemini** (`gemini.ts`): Text from `response.text`. Citations from `candidates[0].groundingMetadata.groundingChunks[].web` (`uri` + `title`).

**Google AIO** (`google-aio.ts`): Text assembled by `flattenBlocks()`, which recursively walks `ai_overview.text_blocks[].snippet`, `.list[]`, and `.text_blocks[]`. Citations from `ai_overview.references[]` where `link` is a string.

`extractCitations(parsed)` on every adapter is a passthrough — it returns `parsed.citations` without further transformation.

---

## 5. Mention Detection

`packages/ai-adapters/src/detect.ts` exports a shared `detectMention` function used by all five adapters' `detectBusinessMention` implementations:

```typescript
function detectMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
  const haystack = parsed.text.toLowerCase();
  const names = [business.name, ...(business.aliases ?? [])].map(n => n.toLowerCase().trim());
  const mentioned = names.some(n => n.length > 0 && haystack.includes(n));
  return { mentioned, competitors: [] };
}
```

- Match is case-insensitive substring inclusion.
- `BusinessRef.aliases` extends matching to alternate names and common misspellings.
- `competitors` is always returned as `[]` — competitor extraction is a planned NLP pass not yet implemented (see section 9).

---

## 6. Failure Handling

**Registry boot**: All four SDK-backed adapters (`chatgpt`, `claude`, `gemini`) construct their API client lazily on first `queryPrompt` call (`private _client?` pattern). The registry loads and the API server boots without any API key present. `PerplexityAdapter` and `GoogleAioAdapter` check for their keys inside `queryPrompt` and throw immediately if missing.

**Per-engine isolation in `prompts.ts`** (`POST /businesses/:id/prompts/test`): Each engine runs inside `Promise.all` with its own `try/catch`. Any thrown error — missing key, region block, `StubAdapter`'s "not implemented" throw, or any network error — is caught and the engine's result entry is returned as `{ status: 'unavailable' }`. The other engines' results are unaffected. The error message is included in `answerExcerpt` only in `NODE_ENV === 'development'`.

**Per-engine isolation in `score-business.ts`**: The audit loop iterates `engines` sequentially. On any thrown error, the engine's `engineId` is added to a `dead: Set<EngineId>` and all subsequent prompts skip it. An engine that fails on prompt 1 is not retried on prompts 2–N. The `dead` set is passed in from the caller (job orchestrator) so a failed engine is also skipped across multiple businesses in the same job run.

**ChatGPT fallback** (`chatgpt.ts`): On 429 or 403 from the Responses API (quota or billing), the adapter retries with the Chat Completions endpoint (no web search). If that also fails, a descriptive error is thrown.

**Gemini fallback** (`gemini.ts`): On 403 (Google Search grounding not enabled for the project), the adapter retries with ungrounded `generateContent`. On 429 a quota error is thrown.

---

## 7. Adding a New Engine

1. Create `packages/ai-adapters/src/adapters/<engine>.ts` implementing `AIEngineAdapter`. Use `claude.ts` as the reference implementation.
2. Add the new engine id string to `ENGINE_IDS` in `packages/shared/src/engines.ts` and add its `EngineMeta` entry (id, name, weight) to `ENGINES`. Weights must sum to 1.0 across all engines.
3. Register the adapter in `packages/ai-adapters/src/registry.ts`:
   ```typescript
   import { MyAdapter } from './adapters/my-engine.js';
   engineRegistry.register(new MyAdapter());
   ```
4. Add the required `API_KEY` env var to `.env.example`, Render/Fly environment config, and the secrets manager.
5. No changes needed in `score-business.ts`, `prompts.ts`, or any business logic — `engineRegistry.all()` picks up the new adapter automatically.

---

## 8. Known Gaps and TODOs

**`StubAdapter`** (`adapters/stub-base.ts`): An abstract base class whose `queryPrompt` throws `"${this.engineName} adapter not implemented yet (§12, Weeks 3–4)"`. No concrete subclass using `StubAdapter` is registered at present — all five registered adapters are fully implemented. The file remains as a scaffold for future engines (Grok, Copilot, Meta AI — listed as v2 in CLAUDE.md §4.8).

**Competitor extraction returns `[]`**: `detectMention` in `detect.ts` always returns `competitors: []`. The comment describes this as intentionally deferred to a later NLP pass. The `prompt_results` DB column and `CompetitorMention` type are wired up, but no extraction runs yet. Competitor Ghost (§3.7) depends on this.

**`costPerQuery` is hardcoded**: Each adapter declares a static `costPerQuery` (Claude: $0.015, ChatGPT: $0.01, Perplexity: $0.005, Gemini: $0.008, Google AIO: $0.02). These are estimates and are not recalculated from actual token counts or API billing data.

**ChatGPT fallback model is hardcoded**: The Chat Completions fallback in `chatgpt.ts` always uses `'gpt-4o-mini'` regardless of `CHATGPT_QUERY_MODEL`.

**`vertical` in `QueryContext` is unused**: All five adapters append `context.geography` to the prompt but ignore `context.vertical`. Vertical-specific prompt framing described in CLAUDE.md §4.1 is not yet implemented.

**Google AIO has no model**: `GoogleAioAdapter` has no `MODEL` constant or model env var — it depends entirely on SerpAPI's scraping. There is no SDK fallback if SerpAPI is unavailable.

**`extractCitations` is a passthrough on all adapters**: The method exists on the contract and is called in `prompts.ts` (citations truncated to 5), but it adds no transformation over `parsed.citations`. Per-adapter citation enrichment (e.g. deduplication, ranking) is not implemented.
