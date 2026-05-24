import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { auditRoutes } from './routes/audit.js';
import { businessRoutes } from './routes/businesses.js';
import { fixRoutes } from './routes/fixes.js';
import { requireAuth } from './auth.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: [process.env.WEB_URL ?? '', process.env.MARKETING_URL ?? ''].filter(Boolean),
  });

  // Public routes
  app.register(healthRoutes);
  app.register(auditRoutes);

  // Authenticated routes — requireAuth runs as an onRequest hook for everything
  // in this scope, so every handler can rely on req.auth being set.
  app.register(async (authed) => {
    authed.addHook('onRequest', requireAuth);
    await businessRoutes(authed);
    await fixRoutes(authed);
  });

  return app;
}
