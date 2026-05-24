import { buildServer } from './server.js';

const port = Number(process.env.API_PORT ?? 3001);
const app = buildServer();

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`wegetfound API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
