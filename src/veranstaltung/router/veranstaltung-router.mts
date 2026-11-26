import { Hono } from 'hono';
import type { db } from '../../db/client.js';
import {
  find,
  findById,
  findOrtByVeranstaltungId,
  findTicketById,
  findTicketsByVeranstaltungId,
} from '../service/veranstaltung-service.js';
import {
  eventParams,
  eventQuery,
  formatVersionTag,
  pagination,
  ticketParams,
  validate,
} from './input.mts';

export function createRouter(database: typeof db) {
  const router = new Hono();

  router.get('/', async (c) => {
    const suchparameter = validate(eventQuery, c.req.query());
    return c.json(await find(database, suchparameter));
  });

  router.get('/:id', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    const row = await findById(database, id);
    const etag = formatVersionTag(row.version);
    c.header('ETag', etag);
    const ifNoneMatch = c.req.header('If-None-Match');
    if (
      ifNoneMatch?.trim() === '*' ||
      ifNoneMatch?.split(',').some((value) => {
        const tag = value.trim();
        return tag === etag || tag === `W/${etag}`;
      })
    ) {
      return c.body(null, 304);
    }
    return c.json(row);
  });

  router.get('/:id/ort', async (c) => {
    const { id: veranstaltungId } = validate(eventParams, c.req.param());
    return c.json(await findOrtByVeranstaltungId(database, veranstaltungId));
  });

  router.get('/:id/tickets', async (c) => {
    const { id } = validate(eventParams, c.req.param());
    const pageable = validate(pagination, c.req.query());
    return c.json(await findTicketsByVeranstaltungId(database, id, pageable));
  });

  router.get('/:id/tickets/:ticketId', async (c) => {
    const { id: veranstaltungId, ticketId: id } = validate(ticketParams, c.req.param());
    return c.json(await findTicketById(database, veranstaltungId, id));
  });

  return router;
}
