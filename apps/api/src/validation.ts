/**
 * Input validation layer for API requests.
 * Enforces sanitization, length limits, and type safety across all endpoints.
 */

// URL validation with length limits
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const MAX_URL_LENGTH = 2048;

export function validateUrl(value: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'URL must be a string' };
  if (value.length === 0) return { ok: false, error: 'URL cannot be empty' };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: `URL exceeds max length (${MAX_URL_LENGTH})` };
  if (!URL_REGEX.test(value)) return { ok: false, error: 'Invalid URL format' };
  return { ok: true, url: value.trim() };
}

// Email validation with length limits
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function validateEmail(value: unknown): { ok: true; email: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Email must be a string' };
  if (value.length === 0) return { ok: false, error: 'Email cannot be empty' };
  if (value.length > MAX_EMAIL_LENGTH) return { ok: false, error: `Email exceeds max length (${MAX_EMAIL_LENGTH})` };
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) return { ok: false, error: 'Invalid email format' };
  return { ok: true, email: trimmed };
}

// String validation with length limits
export function validateString(
  value: unknown,
  { minLength = 1, maxLength = 500, field = 'field' }: { minLength?: number; maxLength?: number; field?: string } = {},
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  if (value.length < minLength)
    return { ok: false, error: `${field} must be at least ${minLength} character(s)` };
  if (value.length > maxLength)
    return { ok: false, error: `${field} must not exceed ${maxLength} character(s)` };
  return { ok: true, value: value.trim() };
}

// Optional string validation (allows null/undefined, validates if present)
export function validateOptionalString(
  value: unknown,
  opts?: Parameters<typeof validateString>[1],
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, value: null };
  }
  const result = validateString(value, opts);
  if (result.ok) return { ok: true, value: result.value };
  return result;
}

// Optional URL validation (allows null/undefined, validates if present)
export function validateOptionalUrl(value: unknown): { ok: true; url: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, url: null };
  }
  const result = validateUrl(value);
  if (result.ok) return { ok: true, url: result.url };
  return result;
}

// Optional email validation (allows null/undefined, validates if present)
export function validateOptionalEmail(value: unknown): { ok: true; email: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { ok: true, email: null };
  }
  const result = validateEmail(value);
  if (result.ok) return { ok: true, email: result.email };
  return result;
}

// ID validation (UUIDs only)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(value: unknown): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'ID must be a string' };
  if (!UUID_REGEX.test(value)) return { ok: false, error: 'Invalid ID format' };
  return { ok: true, id: value };
}

// Vertical/Category validation (enum-like)
export function validateVertical(value: unknown): { ok: true; vertical: string } | { ok: false; error: string } {
  const validValues = ['ecommerce', 'saas', 'local_service', 'nonprofit', 'agency', 'other'];
  if (typeof value !== 'string' || !validValues.includes(value)) {
    return { ok: false, error: `vertical must be one of: ${validValues.join(', ')}` };
  }
  return { ok: true, vertical: value };
}

// Generic enum validator
export function validateEnum<T extends readonly string[]>(
  value: unknown,
  validValues: T,
  field: string,
): { ok: true; value: T[number] } | { ok: false; error: string } {
  if (typeof value !== 'string' || !validValues.includes(value as any)) {
    return { ok: false, error: `${field} must be one of: ${validValues.join(', ')}` };
  }
  return { ok: true, value: value as T[number] };
}
