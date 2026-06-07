import { describe, it, expect } from 'vitest';
import { AppError, ErrorCodes, normalizeError } from './error-handler';

describe('error-handler module', () => {
  describe('AppError', () => {
    it('creates error with code, message, and status', () => {
      const err = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', 400);
      expect(err.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(err.message).toBe('Invalid input');
      expect(err.statusCode).toBe(400);
    });

    it('stores context data', () => {
      const context = { field: 'email', value: 'invalid' };
      const err = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid email', 400, context);
      expect(err.context).toEqual(context);
    });

    it('has correct error code defaults', () => {
      const err = new AppError(ErrorCodes.NOT_FOUND, 'Not found');
      expect(err.statusCode).toBe(404);
    });
  });

  describe('normalizeError', () => {
    it('converts AppError to normalized format', () => {
      const appErr = new AppError(ErrorCodes.VALIDATION_ERROR, 'Bad request', 400);
      const normalized = normalizeError(appErr);

      expect(normalized.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(normalized.message).toBe('Bad request');
      expect(normalized.statusCode).toBe(400);
      expect(normalized.internal).toBe(false);
    });

    it('masks internal Error messages', () => {
      const err = new Error('Database connection failed: password123');
      const normalized = normalizeError(err);

      expect(normalized.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(normalized.message).toBe('An error occurred processing your request');
      expect(normalized.statusCode).toBe(500);
      expect(normalized.internal).toBe(true);
      expect(normalized.context?.internalMessage).toContain('password123');
    });

    it('includes request context', () => {
      const err = new Error('Some error');
      const context = { userId: 'user-123', orgId: 'org-456', requestId: 'req-789' };
      const normalized = normalizeError(err, context);

      expect(normalized.context?.userId).toBe('user-123');
      expect(normalized.context?.orgId).toBe('org-456');
      expect(normalized.requestId).toBe('req-789');
    });

    it('handles unknown error type', () => {
      const normalized = normalizeError('random string');

      expect(normalized.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(normalized.message).toBe('An unknown error occurred');
      expect(normalized.statusCode).toBe(500);
    });

    it('preserves validation error details', () => {
      const err = new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Email is invalid',
        400,
        { field: 'email' },
      );
      const normalized = normalizeError(err);

      expect(normalized.internal).toBe(false);
      expect(normalized.context?.field).toBe('email');
    });

    it('handles null/undefined context', () => {
      const err = new Error('Test error');
      const normalized = normalizeError(err, undefined);

      expect(normalized.context?.userId).toBeUndefined();
      expect(normalized.requestId).toBe('unknown');
    });

    it('includes stack trace in internal errors (context available)', () => {
      const err = new Error('Database error');
      const normalized = normalizeError(err, { requestId: 'req-123' });

      expect(normalized.internal).toBe(true);
      expect(normalized.context?.stack).toBeDefined();
    });

    it('adds timestamp to normalized error', () => {
      const err = new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404);
      const normalized = normalizeError(err);

      expect(normalized.timestamp).toBeDefined();
      expect(new Date(normalized.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('error codes', () => {
    it('maps to correct HTTP status codes', () => {
      const testCases = [
        [ErrorCodes.VALIDATION_ERROR, 400],
        [ErrorCodes.UNAUTHORIZED, 401],
        [ErrorCodes.FORBIDDEN, 403],
        [ErrorCodes.NOT_FOUND, 404],
        [ErrorCodes.CONFLICT, 409],
        [ErrorCodes.RATE_LIMIT, 429],
        [ErrorCodes.SERVICE_UNAVAILABLE, 503],
        [ErrorCodes.EXTERNAL_SERVICE_ERROR, 502],
        [ErrorCodes.DATABASE_ERROR, 500],
        [ErrorCodes.INTERNAL_ERROR, 500],
      ];

      testCases.forEach(([code, expectedStatus]) => {
        const err = new AppError(code as any, 'Test', expectedStatus as number);
        expect(err.statusCode).toBe(expectedStatus);
      });
    });
  });

  describe('error message safety', () => {
    it('never exposes database credentials in user message', () => {
      const err = new Error('Database error: postgres://user:password@host:5432/db');
      const normalized = normalizeError(err);

      expect(normalized.message).not.toContain('password');
      expect(normalized.message).not.toContain('postgres://');
    });

    it('never exposes API keys in user message', () => {
      const err = new Error('API call failed: sk-12345abcde...');
      const normalized = normalizeError(err);

      expect(normalized.message).not.toContain('sk-');
      expect(normalized.message).not.toContain('abcde');
    });

    it('provides helpful message for validation errors', () => {
      const err = new AppError(ErrorCodes.VALIDATION_ERROR, 'Email is invalid', 400);
      const normalized = normalizeError(err);

      expect(normalized.message).toContain('invalid');
    });
  });
});
