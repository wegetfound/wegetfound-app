import type { FastifyInstance } from 'fastify';
import { METHODOLOGY_VERSION } from '@wegetfound/scoring';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    methodologyVersion: METHODOLOGY_VERSION,
    time: new Date().toISOString(),
  }));
}
