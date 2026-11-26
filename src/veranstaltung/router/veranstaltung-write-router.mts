import { Hono } from 'hono';
import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import {
  deleteFn,
  deleteOrt,
  deleteTicket,
  insert,
  insertTicket,
  update,
  updateOrt,
  updateTicket,
} from '../service/veranstaltung-write-service.js';
import { OrtSchema } from '../validation/ort-validation.js';
import { TicketSchema } from '../validation/ticket-validation.js';
import { VeranstaltungSchema } from '../validation/veranstaltung-validation.js';
import {
  eventParams,
  formatVersionTag,
  readBody,
  readExpectedVersion,
  ticketParams,
  validate,
} from './input.mts';

export function createRouter(database: typeof db) {
  const router = new Hono<{ Variables: { organizer: Organizer } }>();

  router.post('/', async (c) => {
    const values = await readBody(VeranstaltungSchema, c.req.raw);
    const row = await insert(database, values, c.get('organizer'));
    c.header('Location', `/veranstaltungen/${row.id}`);
    c.header('ETag', formatVersionTag(row.version));
    return c.json(row, 201);
  });

  router.put('/:id', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    const expectedVersion = readExpectedVersion(c.req.header('If-Match'));
    const values = await readBody(VeranstaltungSchema, c.req.raw);
    const row = await update(database, id, expectedVersion, values, c.get('organizer'));
    c.header('ETag', formatVersionTag(row.version));
    return c.json(row);
  });

  router.delete('/:id', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    await deleteFn(database, id, c.get('organizer'));
    return c.body(null, 204);
  });

  router.put('/:id/ort', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    const values = await readBody(OrtSchema, c.req.raw);
    const result = await updateOrt(database, id, values, c.get('organizer'));
    if (result.created) {
      c.header('Location', `/veranstaltungen/${id}/ort`);
    }
    return c.json(result.row, result.created ? 201 : 200);
  });

  router.delete('/:id/ort', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    await deleteOrt(database, id, c.get('organizer'));
    return c.body(null, 204);
  });

  router.post('/:id/tickets', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    const values = await readBody(TicketSchema, c.req.raw);
    const row = await insertTicket(database, id, values, c.get('organizer'));
    c.header('Location', `/veranstaltungen/${id}/tickets/${row.id}`);
    return c.json(row, 201);
  });

  router.put('/:id/tickets/:ticketId', async (c) => {
    const { id, ticketId } = validate(ticketParams, c.req.param());
    const values = await readBody(TicketSchema, c.req.raw);
    const row = await updateTicket(database, id, ticketId, values, c.get('organizer'));
    return c.json(row);
  });

  router.delete('/:id/tickets/:ticketId', async (c) => {
    const { id, ticketId } = validate(ticketParams, c.req.param());
    await deleteTicket(database, id, ticketId, c.get('organizer'));
    return c.body(null, 204);
  });

  return router;
}
