import { and, eq, inArray } from 'drizzle-orm';
import type { Organizer } from '../auth.js';
import type { db } from './client.js';
import { ort, ticket, veranstaltung } from './schema.js';

export function ownerScope(database: Pick<typeof db, 'select'>, organizer: Organizer) {
  const ownedEvents = database.select({ id: veranstaltung.id }).from(veranstaltung)
    .where(eq(veranstaltung.veranstalterId, organizer.subject));

  return {
    veranstaltung: (id: number) => and(eq(veranstaltung.id, id), eq(veranstaltung.veranstalterId, organizer.subject)),
    ort: (id: number) => and(eq(ort.id, id), inArray(ort.veranstaltungId, ownedEvents)),
    ticket: (id: number) => and(eq(ticket.id, id), inArray(ticket.veranstaltungId, ownedEvents)),
    ownedEvents,
  };
}
