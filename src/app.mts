import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from 'pino';
import { OrganizerRoleRequired, type AccessTokenVerifier, type Organizer } from './auth.js';
import type { db } from './db/client.js';
import { getLogger, type LoggingVariables } from './logger/logger.mts';
import { requestLogger } from './logger/request-logger.mts';
import { responseTime } from './logger/response-time.mts';
import { createProblemDetails } from './problem-details.mts';
import { createGraphqlApp } from './veranstaltung/graphql/graphql-app.js';
import { ValidationError } from './veranstaltung/router/input.mts';
import { createRouter as createVeranstaltungRouter } from './veranstaltung/router/veranstaltung-router.mts';
import { createRouter as createVeranstaltungWriteRouter } from './veranstaltung/router/veranstaltung-write-router.mts';
import { NotFoundError, StaleVersionError } from './veranstaltung/service/errors.js';

function databaseCode(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return undefined;
  }
  return 'code' in error ? error.code : databaseCode(error.cause);
}

export function createApp(
  database: typeof db,
  verify?: AccessTokenVerifier,
  logger: Logger = getLogger('app'),
) {
  const app = new Hono<{ Variables: LoggingVariables & { organizer: Organizer } }>();
  app.use('*', requestLogger(logger), responseTime);

  app.use('/veranstaltungen/*', async (c, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
      if (!verify) {
        throw new HTTPException(503, { message: 'Schreibzugriffe sind nicht konfiguriert.' });
      }
      try {
        c.set('organizer', await verify(c.req.header('Authorization') ?? null));
      } catch (error) {
        if (error instanceof OrganizerRoleRequired) {
          throw new HTTPException(403, { message: 'Rolle veranstalter erforderlich.' });
        }
        c.header('WWW-Authenticate', 'Bearer');
        throw new HTTPException(401, { message: 'Gültiges Access-Token erforderlich.' });
      }
    }
    await next();
  });
  app.use(
    '/veranstaltungen/*',
    bodyLimit({
      maxSize: 16_384,
      onError: () => {
        throw new HTTPException(413, { message: 'Request-Body zu groß.' });
      },
    }),
  );

  app.get('/', (c) => c.json({ message: 'Veranstaltungs-API ist bereit' }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/veranstaltungen', createVeranstaltungRouter(database));
  app.route('/veranstaltungen', createVeranstaltungWriteRouter(database));
  app.route('/', createGraphqlApp(database, verify));

  app.notFound((c) => createProblemDetails(c, 404, 'Ressource nicht gefunden.'));

  app.onError((error, c) => {
    if (error instanceof NotFoundError) {
      return createProblemDetails(c, 404, error.message);
    }
    if (error instanceof StaleVersionError) {
      return createProblemDetails(c, 412, error.message);
    }
    if (error instanceof ValidationError) {
      return createProblemDetails(c, error.status, error.message, error.details);
    }
    if (error instanceof HTTPException) {
      return createProblemDetails(c, error.status, error.message);
    }
    if (databaseCode(error) === '23505') {
      return createProblemDetails(c, 409, 'Ressource existiert bereits.');
    }
    const code = databaseCode(error);
    c.get('requestLogger').error(
      { errorType: error.name, code: typeof code === 'string' ? code : undefined },
      'Anfrage fehlgeschlagen.',
    );
    return createProblemDetails(c, 500, 'Interner Serverfehler.');
  });

  return app;
}
