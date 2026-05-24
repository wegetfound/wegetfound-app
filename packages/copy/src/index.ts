import en from './en.json' with { type: 'json' };

export { BANNED_TERMS, checkCopy, type Violation } from './banned-words.js';

export type Locale = 'en';
const LOCALES: Record<Locale, Record<string, Record<string, string>>> = { en };

export type CopyKey = `${keyof typeof en & string}.${string}`;

/**
 * Resolve a user-facing string. No hardcoded strings anywhere else (§5.4).
 * Supports {placeholder} interpolation:
 *   copy('fix.impact', { points: 8 }) -> "Expected to lift your score by about 8 points"
 */
export function copy(
  key: CopyKey,
  vars?: Record<string, string | number>,
  locale: Locale = 'en',
): string {
  const [section, ...rest] = key.split('.');
  const leaf = rest.join('.');
  const value = LOCALES[locale]?.[section!]?.[leaf];
  if (value === undefined) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Missing copy key: ${key}`);
    }
    return key;
  }
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export { en };
