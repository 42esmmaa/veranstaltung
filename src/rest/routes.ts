import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { OrganizerRoleRequired, type Organizer } from '../auth.js';
import type { db } from '../db/client.js';
import { NotFoundError } from '../veranstaltung/service/errors.js';
import {
  find,
  findById,
  findOrtByVeranstaltungId,
  findTicketById,
  findTicketsByVeranstaltungId,
} from '../veranstaltung/service/veranstaltung-service.js';
import {
  deleteFn,
  deleteOrt,
  deleteTicket,
  insert,
  insertTicket,
  update,
  updateOrt,
  updateTicket,
} from '../veranstaltung/service/veranstaltung-write-service.js';
import { OrtSchema } from '../veranstaltung/validation/ort-validation.js';
import { TicketSchema } from '../veranstaltung/validation/ticket-validation.js';
import { VeranstaltungSchema } from '../veranstaltung/validation/veranstaltung-validation.js';
import {
  eventParams,
  eventQuery,
  pagination,
  readBody,
  ticketParams,
  validate,
  ValidationError,
} from './input.js';

type Verify = (authorization: string | null) => Promise<Organizer>;

function databaseCode(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return undefined;
  }
  return 'code' in error ? error.code : databaseCode(error.cause);
}

export function createEventRoutes(database: typeof db, verify?: Verify) {
  const routes = new Hono<{ Variables: { organizer: Organizer } }>();

  routes.onError((error, context) => {
    if (error instanceof NotFoundError) {
      return context.json({ error: error.message }, 404);
    }
    if (error instanceof ValidationError) {
      return context.json({ error: error.message, details: error.details }, 400);
    }
    if (error instanceof HTTPException) {
      return context.json({ error: error.message }, error.status);
    }
    if (databaseCode(error) === '23505') {
      return context.json({ error: 'Ressource existiert bereits.' }, 409);
    }
    console.error('REST-Anfrage fehlgeschlagen', { name: error.name, code: databaseCode(error) });
    return context.json({ error: 'Interner Serverfehler.' }, 500);
  });

  routes.use('*', async (context, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(context.req.method)) {
      if (!verify) {
        throw new HTTPException(503, { message: 'Schreibzugriffe sind nicht konfiguriert.' });
      }
      try {
        context.set('organizer', await verify(context.req.header('Authorization') ?? null));
      } catch (error) {
        if (error instanceof OrganizerRoleRequired) {
          throw new HTTPException(403, { message: 'Rolle veranstalter erforderlich.' });
        }
        context.header('WWW-Authenticate', 'Bearer');
        throw new HTTPException(401, { message: 'Gültiges Access-Token erforderlich.' });
      }
    }
    await next();
  });
  routes.use(
    '*',
    bodyLimit({
      maxSize: 16_384,
      onError: () => {
        throw new HTTPException(413, { message: 'Request-Body zu groß.' });
      },
    }),
  );

  routes.get('/', async (context) => {
    const suchparameter = validate(eventQuery, context.req.query());
    return context.json(await find(database, suchparameter));
  });

  routes.post('/', async (context) => {
    const values = await readBody(VeranstaltungSchema, context.req.raw);
    const row = await insert(database, values, context.get('organizer'));
    context.header('Location', `/veranstaltungen/${row.id}`);
    return context.json(row, 201);
  });

  routes.get('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    return context.json(await findById(database, id));
  });

  routes.put('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(VeranstaltungSchema, context.req.raw);
    const row = await update(database, id, values, context.get('organizer'));
    return context.json(row);
  });

  routes.delete('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    await deleteFn(database, id, context.get('organizer'));
    return context.body(null, 204);
  });

  routes.get('/:id/ort', async (context) => {
    const { id: veranstaltungId } = validate(eventParams, context.req.param());
    return context.json(await findOrtByVeranstaltungId(database, veranstaltungId));
  });

  routes.put('/:id/ort', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(OrtSchema, context.req.raw);
    const result = await updateOrt(database, id, values, context.get('organizer'));
    if (result.created) {
      context.header('Location', `/veranstaltungen/${id}/ort`);
    }
    return context.json(result.row, result.created ? 201 : 200);
  });

  routes.delete('/:id/ort', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    await deleteOrt(database, id, context.get('organizer'));
    return context.body(null, 204);
  });

  routes.get('/:id/tickets', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const pageable = validate(pagination, context.req.query());
    return context.json(await findTicketsByVeranstaltungId(database, id, pageable));
  });

  routes.post('/:id/tickets', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(TicketSchema, context.req.raw);
    const row = await insertTicket(database, id, values, context.get('organizer'));
    context.header('Location', `/veranstaltungen/${id}/tickets/${row.id}`);
    return context.json(row, 201);
  });

  const ticketPath = '/:id/tickets/:ticketId';
  routes.get(ticketPath, async (context) => {
    const { id: veranstaltungId, ticketId: id } = validate(ticketParams, context.req.param());
    return context.json(await findTicketById(database, veranstaltungId, id));
  });

  routes.put(ticketPath, async (context) => {
    const { id, ticketId } = validate(ticketParams, context.req.param());
    const values = await readBody(TicketSchema, context.req.raw);
    const row = await updateTicket(database, id, ticketId, values, context.get('organizer'));
    return context.json(row);
  });

  routes.delete(ticketPath, async (context) => {
    const { id, ticketId } = validate(ticketParams, context.req.param());
    await deleteTicket(database, id, ticketId, context.get('organizer'));
    return context.body(null, 204);
  });

  return routes;
}
