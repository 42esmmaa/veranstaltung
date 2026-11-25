import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import { ownerScope } from '../../db/ownership.js';
import { veranstaltung } from '../../db/schema.js';
import { NotFoundError } from './errors.js';

export type VeranstaltungInput = Pick<
  typeof veranstaltung.$inferSelect,
  'titel' | 'datum' | 'kategorie' | 'preis' | 'schlagwoerter'
>;

export const insert = async (
  database: typeof db,
  values: VeranstaltungInput,
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
  values: VeranstaltungInput,
  organizer: Organizer,
) => {
  const scope = ownerScope(database, organizer);
  const [row] = await database
    .update(veranstaltung)
    .set(values)
    .where(scope.veranstaltung(id))
    .returning();
  if (row === undefined) {
    throw new NotFoundError('Ressource nicht gefunden.');
  }
  return row;
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
