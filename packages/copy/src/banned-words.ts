// Jargon banned from ALL user-facing copy (CLAUDE.md §5.2). The plain-language
// rule is the brand. checkCopy() runs in CI and fails the build on any violation.

export interface BannedTerm {
  /** Case-insensitive word/phrase that must not appear in user-facing copy. */
  term: string;
  /** What to say instead. */
  use: string;
}

export const BANNED_TERMS: BannedTerm[] = [
  { term: 'schema', use: 'the code that tells AI what your business is' },
  { term: 'json-ld', use: '(never reference)' },
  { term: 'nap', use: 'your business name, address, and phone number' },
  { term: 'structured data', use: 'AI-readable info' },
  { term: 'citation', use: 'mention / got named' },
  { term: 'crawler', use: 'AI engine / AI' },
  { term: 'spider', use: 'AI engine / AI' },
  { term: 'geo', use: '(never reference)' },
  { term: 'aeo', use: '(never reference)' },
  { term: 'llm', use: '(never reference)' },
  { term: 'optimize', use: 'improve' },
  { term: 'leverage', use: 'use' },
  { term: 'synergy', use: '(banned absolutely)' },
  { term: 'solution', use: 'fix / tool' },
];

// Whole-word match, case-insensitive. Phrases (e.g. "structured data") match literally.
function matcher(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

export interface Violation {
  key: string;
  value: string;
  term: string;
  use: string;
}

/** Walk a nested copy object and return every banned-term hit. */
export function checkCopy(copy: Record<string, unknown>, prefix = ''): Violation[] {
  const violations: Violation[] = [];
  for (const [key, value] of Object.entries(copy)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      for (const { term, use } of BANNED_TERMS) {
        if (matcher(term).test(value)) {
          violations.push({ key: path, value, term, use });
        }
      }
    } else if (value && typeof value === 'object') {
      violations.push(...checkCopy(value as Record<string, unknown>, path));
    }
  }
  return violations;
}
