/**
 * Monitoring and observability integration (Sentry).
 * Captures errors, sets context, and tracks performance.
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export function initSentry(dsn: string | undefined) {
  // Only initialize if DSN provided
  if (!dsn || dsn.includes('placeholder')) {
    console.log('[monitoring] Sentry not configured (DSN missing or placeholder)');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      nodeProfilingIntegration(),
    ],
  });

  console.log('[monitoring] Sentry initialized');
}

/**
 * Attach Sentry to Fastify instance.
 */
export function attachSentryToFastify(app: FastifyInstance) {
  // Catch unhandled errors and report to Sentry
  app.addHook('onError', async (request, reply, error) => {
    const isSensitiveError = error?.code?.includes('DB') || error?.message?.includes('password');

    if (!isSensitiveError && process.env.NODE_ENV !== 'development') {
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          method: request.method,
          url: request.url,
        },
      });
    }
  });
}

/**
 * Set Sentry context from request.
 */
export function setSentryContext(
  request: FastifyRequest,
  context: { userId?: string; orgId?: string; businessId?: string },
) {
  Sentry.setUser({
    id: context.userId,
    email: (request as any).auth?.email,
  });

  Sentry.setContext('organization', {
    id: context.orgId,
  });

  if (context.businessId) {
    Sentry.setContext('business', {
      id: context.businessId,
    });
  }
}

/**
 * Capture error with context.
 */
export function captureError(
  error: Error,
  context?: {
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  },
) {
  if (process.env.NODE_ENV === 'development') {
    console.error('[monitoring] Error captured (dev mode):', error);
    return;
  }

  Sentry.captureException(error, {
    level: context?.level || 'error',
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * Capture message (breadcrumb).
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Create a breadcrumb (event timeline).
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  category: string = 'default',
) {
  Sentry.addBreadcrumb({
    message,
    data,
    category,
    level: 'info',
  });
}
