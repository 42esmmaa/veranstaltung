import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT muss eine ganze Zahl zwischen 1 und 65535 sein.');
}

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`Veranstaltungs-API läuft auf http://localhost:${info.port}`);
});
