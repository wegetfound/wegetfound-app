import { StubAdapter } from './stub-base.js';

// TODO (Weeks 3–4): OpenAI API + ChatGPT Search. Use OPENAI_API_KEY.
export class ChatGPTAdapter extends StubAdapter {
  readonly engineId = 'chatgpt' as const;
  readonly engineName = 'ChatGPT';
  readonly costPerQuery = 0.01;
}
