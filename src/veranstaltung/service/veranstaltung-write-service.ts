import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import { ownerScope } from '../../db/ownership.js';
import { ort, ticket, veranstaltung } from '../../db/schema.js';
import { NotFoundError, StaleVersionError } from './errors.js';
import type { OrtType } from '../validation/ort-validation.js';
import type { TicketType } from '../validation/ticket-validation.js';
import type { VeranstaltungType } from '../validation/veranstaltung-validation.js';

export const insert = async (
  database: typeof db,
  values: VeranstaltungType,
  organizer: Organizer,
) => {
  const [row] = await database
    .insert(veranstaltung)
    .values({ ...values, veranstalterId: organizer.subject })
    .returning();
  if (row === undefined) {
    throw new Error('Veranstaltung wurde nicht eingefügt.');
  }
  return row;
};

export const update = async (
  database: typeof db,
  id: number,
  expectedVersion: number,
  values: VeranstaltungType,
  organizer: Organizer,
) => {
  const ownedEvent = ownerScope(database, organizer).veranstaltung(id);
  const [row] = await database
    .update(veranstaltung)
    .set({ ...values, version: sql`${veranstaltung.version} + 1` })
    .where(and(ownedEvent, eq(veranstaltung.version, expectedVersion)))
    .returning();
  if (row !== undefined) {
    return row;
  }
  const [existing] = await database
    .select({ id: veranstaltung.id })
    .from(veranstaltung)
    .where(ownedEvent);
  if (existing !== undefined) {
    throw new StaleVersionError('Die Veranstaltung wurde zwischenzeitlich geändert.');
  }
  throw new NotFoundError('Ressource nicht gefunden.');
};

export const deleteFn = async (database: typeof db, id: number, organizer: Organizer) => {
  const scope = ownerScope(database, organizer);
  const [row] = await database
    .delete(veranstaltung)
    .where(scope.veranstaltung(id))
    .returning({ id: veranstaltung.id });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
};

export const updateOrt = async (
  database: typeof db,
  veranstaltungId: number,
  values: OrtType,
  organizer: Organizer,
) =>
  database.transaction(async (tx) => {
    const scope = ownerScope(tx, organizer);
    const [event] = await tx
      .select({ id: veranstaltung.id })
      .from(veranstaltung)
      .where(scope.veranstaltung(veranstaltungId))
      .for('update');
    if (event === undefined) {
      throw new NotFoundError('Ressource nicht gefunden.');
    }
    const [existing] = await tx
      .update(ort)
      .set(values)
      .where(eq(ort.veranstaltungId, veranstaltungId))
      .returning();
    if (existing !== undefined) {
      return { row: existing, created: false };
    }
    const [row] = await tx
      .insert(ort)
      .values({ ...values, veranstaltungId })
      .returning();
    if (row === undefined) {
      throw new Error('Ort wurde nicht eingefügt.');
    }
    return { row, created: true };
  });

export const deleteOrt = async (
  database: typeof db,
  veranstaltungId: number,
  organizer: Organizer,
) => {
  const scope = ownerScope(database, organizer);
  const [row] = await database
    .delete(ort)
    .where(
      and(
        eq(ort.veranstaltungId, veranstaltungId),
        inArray(ort.veranstaltungId, scope.ownedEvents),
      ),
    )
    .returning({ id: ort.id });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
};

export const insertTicket = async (
  database: typeof db,
  veranstaltungId: number,
  values: TicketType,
  organizer: Organizer,
) =>
  database.transaction(async (tx) => {
    const scope = ownerScope(tx, organizer);
    const [event] = await tx
      .select({ id: veranstaltung.id })
      .from(veranstaltung)
      .where(scope.veranstaltung(veranstaltungId))
      .for('key share');
    if (event === undefined) {
      throw new NotFoundError('Ressource nicht gefunden.');
    }
    const [row] = await tx
      .insert(ticket)
      .values({ ...values, veranstaltungId })
      .returning();
    if (row === undefined) {
      throw new Error('Ticket wurde nicht eingefügt.');
    }
    return row;
  });

export const updateTicket = async (
  database: typeof db,
  veranstaltungId: number,
  id: number,
  values: TicketType,
  organizer: Organizer,
) => {
  const scope = ownerScope(database, organizer);
  const [row] = await database
    .update(ticket)
    .set(values)
    .where(and(eq(ticket.veranstaltungId, veranstaltungId), scope.ticket(id)))
    .returning();
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return row;
};

export const deleteTicket = async (
  database: typeof db,
  veranstaltungId: number,
  id: number,
  organizer: Organizer,
) => {
  const scope = ownerScope(database, organizer);
  const [row] = await database
    .delete(ticket)
    .where(and(eq(ticket.veranstaltungId, veranstaltungId), scope.ticket(id)))
    .returning({ id: ticket.id });
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
};
