import { pgSchema, integer, text, date, numeric, jsonb, timestamp, unique, index, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const veranstaltungSchema = pgSchema('veranstaltung');

export const kategorieEnum = veranstaltungSchema.enum('kategorie', [
  'KONZERT',
  'SPORT',
  'THEATER',
  'WORKSHOP',
  'SONSTIGES',
]);

export const veranstaltung = veranstaltungSchema.table('veranstaltung', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  titel: text().notNull(),
  datum: date().notNull(),
  kategorie: kategorieEnum().notNull(),
  schlagwoerter: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  preis: numeric({ precision: 8, scale: 2 }).notNull(),
  // OIDC/JWT subject (sub) des eingeloggten Users, kein separates User-Konto in der DB.
  veranstalterId: text('veranstalter_id').notNull(),
  erstellt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  aktualisiert: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('veranstaltung_veranstalter_id_idx').on(table.veranstalterId),
]);

export const ort = veranstaltungSchema.table('ort', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  strasse: text().notNull(),
  plz: text().notNull(),
  stadt: text().notNull(),
  veranstaltungId: integer('veranstaltung_id')
    .notNull()
    .references(() => veranstaltung.id, { onDelete: 'cascade' }),
}, (table) => [
  unique('ort_veranstaltung_id_key').on(table.veranstaltungId),
]);

export const ticket = veranstaltungSchema.table('ticket', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  bezeichnung: text().notNull(),
  preis: numeric({ precision: 8, scale: 2 }).notNull(),
  kontingent: integer().notNull(),
  aktiv: boolean().default(true).notNull(),
  veranstaltungId: integer('veranstaltung_id')
    .notNull()
    .references(() => veranstaltung.id, { onDelete: 'cascade' }),
}, (table) => [
  index('ticket_veranstaltung_id_idx').on(table.veranstaltungId),
]);
