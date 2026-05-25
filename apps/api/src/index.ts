import './load-env.js';
import { buildServer } from './server.js';

// Hosts (Render, Railway, Fly, etc.) inject PORT; fall back to API_PORT for local dev.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const app = buildServer();

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`wegetfound API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
