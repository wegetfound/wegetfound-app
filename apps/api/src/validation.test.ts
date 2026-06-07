import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateEmail,
  validateString,
  validateOptionalString,
  validateOptionalUrl,
  validateOptionalEmail,
  validateUuid,
  validateVertical,
  validateEnum,
} from './validation';

describe('validation module', () => {
  describe('validateUrl', () => {
    it('accepts valid http URL', () => {
      const result = validateUrl('http://example.com/path');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toBe('http://example.com/path');
    });

    it('accepts valid https URL', () => {
      const result = validateUrl('https://example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toBe('https://example.com');
    });

    it('rejects URL without protocol', () => {
      const result = validateUrl('example.com');
      expect(result.ok).toBe(false);
    });

    it('rejects empty URL', () => {
      const result = validateUrl('');
      expect(result.ok).toBe(false);
    });

    it('rejects non-string', () => {
      const result = validateUrl(123 as any);
      expect(result.ok).toBe(false);
    });

    it('rejects URL exceeding max length', () => {
      const longUrl = 'https://' + 'a'.repeat(2100);
      const result = validateUrl(longUrl);
      expect(result.ok).toBe(false);
    });

    it('handles URL with query parameters', () => {
      const result = validateUrl('https://example.com?foo=bar&baz=qux');
      expect(result.ok).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('accepts valid email', () => {
      const result = validateEmail('user@example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe('user@example.com');
    });

    it('converts email to lowercase', () => {
      const result = validateEmail('User@Example.COM');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe('user@example.com');
    });

    it('rejects email without @', () => {
      const result = validateEmail('userexample.com');
      expect(result.ok).toBe(false);
    });

    it('rejects email without domain', () => {
      const result = validateEmail('user@');
      expect(result.ok).toBe(false);
    });

    it('rejects empty email', () => {
      const result = validateEmail('');
      expect(result.ok).toBe(false);
    });

    it('rejects email exceeding max length', () => {
      const longEmail = 'a'.repeat(300) + '@example.com';
      const result = validateEmail(longEmail);
      expect(result.ok).toBe(false);
    });

    it('accepts email with subdomain', () => {
      const result = validateEmail('user@mail.example.co.uk');
      expect(result.ok).toBe(true);
    });
  });

  describe('validateString', () => {
    it('accepts valid string', () => {
      const result = validateString('hello world');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('hello world');
    });

    it('trims whitespace', () => {
      const result = validateString('  hello world  ');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('hello world');
    });

    it('rejects empty string', () => {
      const result = validateString('', { minLength: 1 });
      expect(result.ok).toBe(false);
    });

    it('enforces min length', () => {
      const result = validateString('hi', { minLength: 3 });
      expect(result.ok).toBe(false);
    });

    it('enforces max length', () => {
      const result = validateString('hello world', { maxLength: 5 });
      expect(result.ok).toBe(false);
    });

    it('accepts string within bounds', () => {
      const result = validateString('hello', { minLength: 3, maxLength: 10 });
      expect(result.ok).toBe(true);
    });

    it('rejects non-string', () => {
      const result = validateString(123 as any);
      expect(result.ok).toBe(false);
    });
  });

  describe('validateOptionalString', () => {
    it('accepts valid string', () => {
      const result = validateOptionalString('hello');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('hello');
    });

    it('accepts null', () => {
      const result = validateOptionalString(null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(null);
    });

    it('accepts undefined', () => {
      const result = validateOptionalString(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(null);
    });

    it('accepts empty string as null', () => {
      const result = validateOptionalString('');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(null);
    });

    it('rejects string exceeding max length', () => {
      const result = validateOptionalString('a'.repeat(501), { maxLength: 500 });
      expect(result.ok).toBe(false);
    });
  });

  describe('validateOptionalUrl', () => {
    it('accepts valid URL', () => {
      const result = validateOptionalUrl('https://example.com');
      expect(result.ok).toBe(true);
    });

    it('accepts null', () => {
      const result = validateOptionalUrl(null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toBe(null);
    });

    it('accepts undefined', () => {
      const result = validateOptionalUrl(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toBe(null);
    });

    it('accepts empty string as null', () => {
      const result = validateOptionalUrl('');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toBe(null);
    });

    it('rejects invalid URL', () => {
      const result = validateOptionalUrl('not-a-url');
      expect(result.ok).toBe(false);
    });
  });

  describe('validateOptionalEmail', () => {
    it('accepts valid email', () => {
      const result = validateOptionalEmail('user@example.com');
      expect(result.ok).toBe(true);
    });

    it('accepts null', () => {
      const result = validateOptionalEmail(null);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe(null);
    });

    it('accepts undefined', () => {
      const result = validateOptionalEmail(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe(null);
    });

    it('accepts empty string as null', () => {
      const result = validateOptionalEmail('');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.email).toBe(null);
    });
  });

  describe('validateUuid', () => {
    it('accepts valid UUID v4', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateUuid(uuid);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.id).toBe(uuid);
    });

    it('accepts uppercase UUID', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = validateUuid(uuid);
      expect(result.ok).toBe(true);
    });

    it('rejects invalid UUID format', () => {
      const result = validateUuid('not-a-uuid');
      expect(result.ok).toBe(false);
    });

    it('rejects UUID without hyphens', () => {
      const result = validateUuid('550e8400e29b41d4a716446655440000');
      expect(result.ok).toBe(false);
    });

    it('rejects empty string', () => {
      const result = validateUuid('');
      expect(result.ok).toBe(false);
    });

    it('rejects non-string', () => {
      const result = validateUuid(123 as any);
      expect(result.ok).toBe(false);
    });
  });

  describe('validateVertical', () => {
    it('accepts valid vertical', () => {
      const validVerticals = ['ecommerce', 'saas', 'local_service', 'nonprofit', 'agency', 'other'];
      validVerticals.forEach((vertical) => {
        const result = validateVertical(vertical);
        expect(result.ok).toBe(true);
      });
    });

    it('rejects invalid vertical', () => {
      const result = validateVertical('invalid_vertical');
      expect(result.ok).toBe(false);
    });

    it('rejects non-string', () => {
      const result = validateVertical(123 as any);
      expect(result.ok).toBe(false);
    });
  });

  describe('validateEnum', () => {
    const validPlans = ['free', 'starter', 'growth', 'agency'] as const;

    it('accepts valid enum value', () => {
      const result = validateEnum('starter', validPlans, 'plan');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('starter');
    });

    it('rejects invalid enum value', () => {
      const result = validateEnum('premium', validPlans, 'plan');
      expect(result.ok).toBe(false);
    });

    it('rejects non-string', () => {
      const result = validateEnum(123 as any, validPlans, 'plan');
      expect(result.ok).toBe(false);
    });

    it('includes field name in error message', () => {
      const result = validateEnum('invalid', validPlans, 'plan');
      if (!result.ok) {
        expect(result.error).toContain('plan');
      }
    });
  });
});
