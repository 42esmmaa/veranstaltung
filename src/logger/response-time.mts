import { createMiddleware } from 'hono/factory';
import type { LoggingVariables } from './logger.mts';

export const responseTime = createMiddleware<{ Variables: LoggingVariables }>(async (c, next) => {
  const start = performance.now();
  await next();
  c.get('requestLogger').info(
    {
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    },
    'Anfrage abgeschlossen.',
  );
});
