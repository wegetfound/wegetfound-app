import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { auditRoutes } from './routes/audit.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: [process.env.WEB_URL ?? '', process.env.MARKETING_URL ?? ''].filter(Boolean),
  });

  // Public routes
  app.register(healthRoutes);
  app.register(auditRoutes);

  // Authenticated routes are registered under a scope that applies requireAuth
  // as an onRequest hook — added in Weeks 7–8 as the web app core comes online.

  return app;
}
