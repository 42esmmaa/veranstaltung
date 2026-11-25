import {
  pgSchema,
  integer,
  text,
  numeric,
  jsonb,
  timestamp,
  unique,
  index,
  boolean,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const veranstaltungSchema = pgSchema('veranstaltung');

export const kategorieEnum = veranstaltungSchema.enum('kategorie', [
  'KONZERT',
  'SPORT',
  'THEATER',
  'WORKSHOP',
  'SONSTIGES',
]);

export const veranstaltung = veranstaltungSchema.table(
  'veranstaltung',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    titel: text().notNull(),
    datum: timestamp({ withTimezone: true }).notNull(),
    kategorie: kategorieEnum().notNull(),
    schlagwoerter: jsonb()
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    preis: numeric({ precision: 8, scale: 2 }).notNull(),
    // User-ID aus dem verifizierten OIDC-Token (claim `sub`).
    veranstalterId: text('veranstalter_id').notNull(),
    erstellt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    aktualisiert: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('veranstaltung_veranstalter_id_idx').on(table.veranstalterId),
    check('veranstaltung_preis_check', sql`${table.preis} >= 0`),
    check(
      'veranstaltung_schlagwoerter_check',
      sql`jsonb_typeof(${table.schlagwoerter}) = 'array' AND NOT jsonb_path_exists(${table.schlagwoerter}, 'strict $[*] ? (@.type() != "string")')`,
    ),
  ],
);

export const ort = veranstaltungSchema.table(
  'ort',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    strasse: text().notNull(),
    plz: text().notNull(),
    stadt: text().notNull(),
    veranstaltungId: integer('veranstaltung_id').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.veranstaltungId],
      foreignColumns: [veranstaltung.id],
      name: 'ort_veranstaltung_id_fkey',
    }).onDelete('cascade'),
    unique('ort_veranstaltung_id_key').on(table.veranstaltungId),
  ],
);

export const ticket = veranstaltungSchema.table(
  'ticket',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    bezeichnung: text().notNull(),
    preis: numeric({ precision: 8, scale: 2 }).notNull(),
    kontingent: integer().notNull(),
    aktiv: boolean().default(true).notNull(),
    veranstaltungId: integer('veranstaltung_id').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.veranstaltungId],
      foreignColumns: [veranstaltung.id],
      name: 'ticket_veranstaltung_id_fkey',
    }).onDelete('cascade'),
    index('ticket_veranstaltung_id_idx').on(table.veranstaltungId),
    check('ticket_preis_check', sql`${table.preis} >= 0`),
    check('ticket_kontingent_check', sql`${table.kontingent} >= 0`),
  ],
);
