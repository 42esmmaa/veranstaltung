import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { OrganizerRoleRequired, type AccessTokenVerifier, type Organizer } from './auth.js';
import type { db } from './db/client.js';
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

export function createApp(database: typeof db, verify?: AccessTokenVerifier) {
  const app = new Hono<{ Variables: { organizer: Organizer } }>();

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

  app.onError((error, c) => {
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof StaleVersionError) {
      return c.json({ error: error.message }, 412);
    }
    if (error instanceof ValidationError) {
      return c.json({ error: error.message, details: error.details }, 400);
    }
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    if (databaseCode(error) === '23505') {
      return c.json({ error: 'Ressource existiert bereits.' }, 409);
    }
    console.error('REST-Anfrage fehlgeschlagen', { name: error.name, code: databaseCode(error) });
    return c.json({ error: 'Interner Serverfehler.' }, 500);
  });

  return app;
}
