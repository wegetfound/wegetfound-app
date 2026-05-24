import { StubAdapter } from './stub-base.js';

// TODO (Weeks 3–4): Perplexity Sonar API. Use PERPLEXITY_API_KEY.
export class PerplexityAdapter extends StubAdapter {
  readonly engineId = 'perplexity' as const;
  readonly engineName = 'Perplexity';
  readonly costPerQuery = 0.005;
}
