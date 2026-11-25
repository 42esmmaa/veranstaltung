import { and, asc, eq, gte, ilike, sql } from 'drizzle-orm';
import type { db } from '../../db/client.js';
import { ticket, veranstaltung } from '../../db/schema.js';
import { NotFoundError } from './errors.js';
import type { Suchparameter } from './suchparameter.js';

export const findById = async (database: typeof db, id: number) => {
  const row = await database.query.veranstaltung.findFirst({ where: { id } });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return row;
};

export const findOrtByVeranstaltungId = async (database: typeof db, veranstaltungId: number) => {
  const row = await database.query.ort.findFirst({ where: { veranstaltungId } });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return row;
};

export const findTicketsByVeranstaltungId = async (
  database: typeof db,
  veranstaltungId: number,
  { limit, offset }: Pick<Suchparameter, 'limit' | 'offset'>,
) => {
  const event = await database.query.veranstaltung.findFirst({
    where: { id: veranstaltungId },
    columns: { id: true },
  });
  if (event === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return database
    .select()
    .from(ticket)
    .where(eq(ticket.veranstaltungId, veranstaltungId))
    .orderBy(asc(ticket.id))
    .limit(limit)
    .offset(offset);
};

export const findTicketById = async (database: typeof db, veranstaltungId: number, id: number) => {
  const row = await database.query.ticket.findFirst({ where: { id, veranstaltungId } });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return row;
};

export const find = async (
  database: typeof db,
  { q, kategorie, ab, schlagwort, limit, offset }: Suchparameter,
) => {
  const term = q === undefined ? undefined : q.replace(/[\\%_]/g, '\\$&');
  const conditions = and(
    term === undefined ? undefined : ilike(veranstaltung.titel, `%${term}%`),
    kategorie === undefined ? undefined : eq(veranstaltung.kategorie, kategorie),
    ab === undefined ? undefined : gte(veranstaltung.datum, ab),
    schlagwort === undefined
      ? undefined
      : sql`${veranstaltung.schlagwoerter} @> ${JSON.stringify([schlagwort])}::jsonb`,
  );
  return database
    .select()
    .from(veranstaltung)
    .where(conditions)
    .orderBy(asc(veranstaltung.datum), asc(veranstaltung.id))
    .limit(limit)
    .offset(offset);
};
