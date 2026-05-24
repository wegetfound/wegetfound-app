import type { EngineId } from '@wegetfound/shared';
import { ENGINE_IDS } from '@wegetfound/shared';
import type { AIEngineAdapter } from './types.js';
import { ClaudeAdapter } from './adapters/claude.js';
import { ChatGPTAdapter } from './adapters/chatgpt.js';
import { PerplexityAdapter } from './adapters/perplexity.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { GoogleAioAdapter } from './adapters/google-aio.js';

// THE seam (§6.4). Business logic imports this registry, never a concrete adapter.
// Swapping or adding an engine happens here and nowhere else.
class EngineRegistry {
  private adapters = new Map<EngineId, AIEngineAdapter>();

  register(adapter: AIEngineAdapter): void {
    this.adapters.set(adapter.engineId, adapter);
  }

  get(engineId: EngineId): AIEngineAdapter {
    const adapter = this.adapters.get(engineId);
    if (!adapter) throw new Error(`No adapter registered for engine: ${engineId}`);
    return adapter;
  }

  /** All registered adapters, in the canonical engine order. */
  all(): AIEngineAdapter[] {
    return ENGINE_IDS.map((id) => this.get(id));
  }
}

export const engineRegistry = new EngineRegistry();

// One registration per engine. Adding an engine = one new adapter file + one line here.
engineRegistry.register(new ClaudeAdapter());
engineRegistry.register(new ChatGPTAdapter());
engineRegistry.register(new PerplexityAdapter());
engineRegistry.register(new GeminiAdapter());
engineRegistry.register(new GoogleAioAdapter());
