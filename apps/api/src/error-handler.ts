/**
 * Error handling and structured logging.
 * Normalizes errors, adds request context, and ensures safe user-facing messages.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Common error codes
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// Map error codes to HTTP status codes
const statusCodeMap: Record<string, number> = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.RATE_LIMIT]: 429,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.INTERNAL_ERROR]: 500,
};

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = statusCodeMap[code] ?? 500,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Normalize errors into structured format.
 * External errors (DB, services) log full details; user-facing errors expose safe message.
 */
export function normalizeError(
  err: unknown,
  context?: { requestId?: string; userId?: string; orgId?: string },
) {
  const requestId = context?.requestId || 'unknown';
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      requestId,
      timestamp,
      context: err.context,
      internal: false,
    };
  }

  if (err instanceof Error) {
    // Don't expose internal error details to clients
    const isInternal = !(err.message.includes('validation') || err.message.includes('not found'));
    const userMessage = isInternal ? 'An error occurred processing your request' : err.message;

    return {
      code: ErrorCodes.INTERNAL_ERROR,
      message: userMessage,
      statusCode: 500,
      requestId,
      timestamp,
      context: {
        userId: context?.userId,
        orgId: context?.orgId,
        internalMessage: isInternal ? err.message : undefined,
        stack: isInternal ? err.stack : undefined,
      },
      internal: isInternal,
    };
  }

  return {
    code: ErrorCodes.INTERNAL_ERROR,
    message: 'An unknown error occurred',
    statusCode: 500,
    requestId,
    timestamp,
    context: { userId: context?.userId, orgId: context?.orgId },
    internal: true,
  };
}

/**
 * Register error handler hook on Fastify instance.
 * Logs errors and returns normalized response.
 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(async (err, request, reply) => {
    const normalized = normalizeError(err, {
      requestId: request.id,
      userId: (request as any).auth?.userId,
      orgId: (request as any).auth?.orgId,
    });

    // Log errors with appropriate level
    if (normalized.internal) {
      app.log.error(
        {
          code: normalized.code,
          message: normalized.message,
          requestId: normalized.requestId,
          context: normalized.context,
        },
        `Error handling ${request.method} ${request.url}`,
      );
    } else {
      app.log.warn(
        {
          code: normalized.code,
          message: normalized.message,
          requestId: normalized.requestId,
        },
        `Validation error on ${request.method} ${request.url}`,
      );
    }

    return reply.code(normalized.statusCode).send({
      error: normalized.message,
      code: normalized.code,
      requestId: normalized.requestId,
      ...(process.env.NODE_ENV === 'development' && { context: normalized.context }),
    });
  });
}

/**
 * Express-like try-catch wrapper for async route handlers.
 * Passes errors to Fastify's error handler.
 */
export function asyncHandler(
  fn: (req: FastifyRequest, reply: FastifyReply) => Promise<any>,
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(req, reply);
    } catch (err) {
      throw err; // Fastify's error handler will catch this
    }
  };
}
