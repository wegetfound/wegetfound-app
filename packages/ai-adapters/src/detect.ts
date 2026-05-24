import type { BusinessRef, MentionResult, ParsedResponse } from './types.js';

// Shared mention-detection so every adapter behaves identically. v1 uses
// case-insensitive whole-name matching; competitor extraction is intentionally
// left to a later pass (NLP) and returns [] here.
export function detectMention(parsed: ParsedResponse, business: BusinessRef): MentionResult {
  const haystack = parsed.text.toLowerCase();
  const names = [business.name, ...(business.aliases ?? [])].map((n) => n.toLowerCase().trim());
  const mentioned = names.some((n) => n.length > 0 && haystack.includes(n));
  return { mentioned, competitors: [] };
}
