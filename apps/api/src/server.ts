import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { auditRoutes } from './routes/audit.js';
import { businessRoutes } from './routes/businesses.js';
import { fixRoutes } from './routes/fixes.js';
import { meRoutes } from './routes/me.js';
import { promptRoutes } from './routes/prompts.js';
import { webhookRoutes } from './routes/webhooks.js';
import { stripeCheckoutRoutes } from './routes/stripe-checkout.js';
import { requireAuth } from './auth.js';
import { registerErrorHandler } from './error-handler.js';
import { initSentry, attachSentryToFastify } from './monitoring.js';

export function buildServer(): FastifyInstance {
  // Initialize Sentry for error tracking (if configured)
  initSentry(process.env.SENTRY_DSN);

  // connectionTimeout raised to 5 min so the audit route (sequential AI engine
  // calls per prompt) has enough time to finish and send the score back to the browser.
  const app = Fastify({ logger: true, connectionTimeout: 300_000, requestIdLogLabel: 'reqId' });

  // Attach Sentry to Fastify for automatic error capture
  attachSentryToFastify(app);

  // Register error handler first (before routes)
  registerErrorHandler(app);

  app.register(cors, {
    origin: [process.env.WEB_URL ?? '', process.env.MARKETING_URL ?? ''].filter(Boolean),
  });

  // Public routes
  app.register(healthRoutes);
  app.register(auditRoutes);
  app.register(webhookRoutes);

  // Authenticated routes — requireAuth runs as an onRequest hook for everything
  // in this scope, so every handler can rely on req.auth being set.
  app.register(async (authed) => {
    authed.addHook('onRequest', requireAuth);
    await businessRoutes(authed);
    await fixRoutes(authed);
    await meRoutes(authed);
    await promptRoutes(authed);
    await stripeCheckoutRoutes(authed);
  });

  return app;
}
