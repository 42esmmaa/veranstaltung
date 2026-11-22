import { and, asc, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { OrganizerRoleRequired, type Organizer } from '../auth.js';
import type { db } from '../db/client.js';
import { ownerScope } from '../db/ownership.js';
import { ort, ticket, veranstaltung } from '../db/schema.js';
import { eventInput, eventParams, eventQuery, pagination, placeInput, readBody, ticketInput, ticketParams, validate, ValidationError } from './input.js';

type Verify = (authorization: string | null) => Promise<Organizer>;

function required<Row>(row: Row | undefined): Row {
  if (row === undefined) throw new HTTPException(404, { message: 'Ressource nicht gefunden.' });
  return row;
}

function databaseCode(error: unknown): unknown {
  if (!(error instanceof Error)) return undefined;
  return 'code' in error ? error.code : databaseCode(error.cause);
}

export function createEventRoutes(database: typeof db, verify?: Verify) {
  const routes = new Hono<{ Variables: { organizer: Organizer } }>();

  routes.onError((error, context) => {
    if (error instanceof ValidationError) return context.json({ error: error.message, details: error.details }, 400);
    if (error instanceof HTTPException) return context.json({ error: error.message }, error.status);
    if (databaseCode(error) === '23505') return context.json({ error: 'Ressource existiert bereits.' }, 409);
    console.error('REST-Anfrage fehlgeschlagen', { name: error.name, code: databaseCode(error) });
    return context.json({ error: 'Interner Serverfehler.' }, 500);
  });

  routes.use('*', async (context, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(context.req.method)) {
      if (!verify) throw new HTTPException(503, { message: 'Schreibzugriffe sind nicht konfiguriert.' });
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
  routes.use('*', bodyLimit({
    maxSize: 16_384,
    onError: () => { throw new HTTPException(413, { message: 'Request-Body zu groß.' }); },
  }));

  routes.get('/', async (context) => {
    const { q, kategorie, ab, schlagwort, limit, offset } = validate(eventQuery, context.req.query());
    const term = q === undefined ? undefined : q.replace(/[\\%_]/g, '\\$&');
    const conditions = and(
      term === undefined ? undefined : ilike(veranstaltung.titel, `%${term}%`),
      kategorie === undefined ? undefined : eq(veranstaltung.kategorie, kategorie),
      ab === undefined ? undefined : gte(veranstaltung.datum, ab),
      schlagwort === undefined ? undefined : sql`${veranstaltung.schlagwoerter} @> ${JSON.stringify([schlagwort])}::jsonb`,
    );
    const rows = await database.select().from(veranstaltung).where(conditions)
      .orderBy(asc(veranstaltung.datum), asc(veranstaltung.id))
      .limit(limit).offset(offset);
    return context.json(rows);
  });

  routes.post('/', async (context) => {
    const values = await readBody(eventInput, context.req.raw);
    const [row] = await database.insert(veranstaltung)
      .values({ ...values, veranstalterId: context.get('organizer').subject }).returning();
    context.header('Location', `/veranstaltungen/${row.id}`);
    return context.json(row, 201);
  });

  routes.get('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    return context.json(required(await database.query.veranstaltung.findFirst({ where: { id } })));
  });

  routes.put('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(eventInput, context.req.raw);
    const scope = ownerScope(database, context.get('organizer'));
    const [row] = await database.update(veranstaltung).set(values).where(scope.veranstaltung(id)).returning();
    return context.json(required(row));
  });

  routes.delete('/:id', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const scope = ownerScope(database, context.get('organizer'));
    required((await database.delete(veranstaltung).where(scope.veranstaltung(id)).returning())[0]);
    return context.body(null, 204);
  });

  routes.get('/:id/ort', async (context) => {
    const { id: veranstaltungId } = validate(eventParams, context.req.param());
    return context.json(required(await database.query.ort.findFirst({ where: { veranstaltungId } })));
  });

  routes.put('/:id/ort', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(placeInput, context.req.raw);
    const organizer = context.get('organizer');
    const result = await database.transaction(async (tx) => {
      const scope = ownerScope(tx, organizer);
      required((await tx.select({ id: veranstaltung.id }).from(veranstaltung)
        .where(scope.veranstaltung(id)).for('update'))[0]);
      const [existing] = await tx.update(ort).set(values).where(eq(ort.veranstaltungId, id)).returning();
      if (existing) return { row: existing, created: false };
      const [row] = await tx.insert(ort).values({ ...values, veranstaltungId: id }).returning();
      return { row, created: true };
    });
    if (result.created) context.header('Location', `/veranstaltungen/${id}/ort`);
    return context.json(result.row, result.created ? 201 : 200);
  });

  routes.delete('/:id/ort', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const scope = ownerScope(database, context.get('organizer'));
    required((await database.delete(ort)
      .where(and(eq(ort.veranstaltungId, id), inArray(ort.veranstaltungId, scope.ownedEvents)))
      .returning())[0]);
    return context.body(null, 204);
  });

  routes.get('/:id/tickets', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const { limit, offset } = validate(pagination, context.req.query());
    required(await database.query.veranstaltung.findFirst({ where: { id }, columns: { id: true } }));
    return context.json(await database.select().from(ticket).where(eq(ticket.veranstaltungId, id))
      .orderBy(asc(ticket.id)).limit(limit).offset(offset));
  });

  routes.post('/:id/tickets', async (context) => {
    const { id } = validate(eventParams, context.req.param());
    const values = await readBody(ticketInput, context.req.raw);
    const organizer = context.get('organizer');
    const row = await database.transaction(async (tx) => {
      const scope = ownerScope(tx, organizer);
      required((await tx.select({ id: veranstaltung.id }).from(veranstaltung)
        .where(scope.veranstaltung(id)).for('key share'))[0]);
      return (await tx.insert(ticket).values({ ...values, veranstaltungId: id }).returning())[0];
    });
    context.header('Location', `/veranstaltungen/${id}/tickets/${row.id}`);
    return context.json(row, 201);
  });

  const ticketPath = '/:id/tickets/:ticketId';
  routes.get(ticketPath, async (context) => {
    const { id: veranstaltungId, ticketId: id } = validate(ticketParams, context.req.param());
    return context.json(required(await database.query.ticket.findFirst({ where: { id, veranstaltungId } })));
  });

  routes.put(ticketPath, async (context) => {
    const { id, ticketId } = validate(ticketParams, context.req.param());
    const values = await readBody(ticketInput, context.req.raw);
    const scope = ownerScope(database, context.get('organizer'));
    const [row] = await database.update(ticket).set(values)
      .where(and(eq(ticket.veranstaltungId, id), scope.ticket(ticketId))).returning();
    return context.json(required(row));
  });

  routes.delete(ticketPath, async (context) => {
    const { id, ticketId } = validate(ticketParams, context.req.param());
    const scope = ownerScope(database, context.get('organizer'));
    required((await database.delete(ticket)
      .where(and(eq(ticket.veranstaltungId, id), scope.ticket(ticketId))).returning())[0]);
    return context.body(null, 204);
  });

  return routes;
}
