import { and, eq, inArray } from 'drizzle-orm';
import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import { ownerScope } from '../../db/ownership.js';
import { ort, veranstaltung } from '../../db/schema.js';
import { NotFoundError } from './errors.js';

export type VeranstaltungInput = Pick<
  typeof veranstaltung.$inferSelect,
  'titel' | 'datum' | 'kategorie' | 'preis' | 'schlagwoerter'
>;

export type OrtInput = Pick<typeof ort.$inferSelect, 'name' | 'strasse' | 'plz' | 'stadt'>;

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

export const updateOrt = async (
  database: typeof db,
  veranstaltungId: number,
  values: OrtInput,
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
