import { randomUUID } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { Logger } from 'pino';
import type { LoggingVariables } from './logger.mts';

export const requestLogger = (logger: Logger) =>
  createMiddleware<{ Variables: LoggingVariables }>(async (c, next) => {
    const requestId = randomUUID();
    const child = logger.child({ requestId, method: c.req.method });
    c.set('requestId', requestId);
    c.set('requestLogger', child);
    c.header('X-Request-Id', requestId);
    child.debug('Anfrage empfangen.');
    await next();
  });
