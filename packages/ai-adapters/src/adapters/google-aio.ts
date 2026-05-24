import { StubAdapter } from './stub-base.js';

// TODO (Weeks 3–4): Google AI Overviews via SerpAPI or headless browser. Use SERPAPI_KEY.
export class GoogleAioAdapter extends StubAdapter {
  readonly engineId = 'google_aio' as const;
  readonly engineName = 'Google AI Overviews';
  readonly costPerQuery = 0.02;
}
