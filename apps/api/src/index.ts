import './load-env.js';
import { buildServer } from './server.js';
import { startScoreWorker } from './workers/score-worker.js';
import { startEmailWorker } from './workers/email-worker.js';
import { startScheduler } from './workers/scheduler.js';
import { redis, testRedisConnection, closeQueues } from './queue.js';

// Hosts (Render, Railway, Fly, etc.) inject PORT; fall back to API_PORT for local dev.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const app = buildServer();

app
  .listen({ port, host: '0.0.0.0' })
  .then(async () => {
    app.log.info(`wegetfound API listening on :${port}`);

    // Start background workers
    try {
      const redisOk = await testRedisConnection();
      if (redisOk) {
        app.log.info('Starting background workers...');
        startScoreWorker(redis);
        startEmailWorker(redis);
        await startScheduler();
        app.log.info('Background workers started');
      } else {
        app.log.warn('Redis not available; background workers disabled');
      }
    } catch (err) {
      app.log.error('Failed to start background workers:', err);
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      app.log.info('SIGTERM received, shutting down gracefully...');
      await app.close();
      await closeQueues();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
