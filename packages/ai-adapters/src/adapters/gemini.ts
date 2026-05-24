import { StubAdapter } from './stub-base.js';

// TODO (Weeks 3–4): Google AI API. Use GOOGLE_AI_API_KEY.
export class GeminiAdapter extends StubAdapter {
  readonly engineId = 'gemini' as const;
  readonly engineName = 'Gemini';
  readonly costPerQuery = 0.008;
}
