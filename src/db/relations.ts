import { relations } from 'drizzle-orm';
import { ort, ticket, veranstaltung } from './schema.js';

export const veranstaltungRelations = relations(veranstaltung, ({ one, many }) => ({
  ort: one(ort),
  tickets: many(ticket),
}));

export const ortRelations = relations(ort, ({ one }) => ({
  veranstaltung: one(veranstaltung, {
    fields: [ort.veranstaltungId],
    references: [veranstaltung.id],
  }),
}));

export const ticketRelations = relations(ticket, ({ one }) => ({
  veranstaltung: one(veranstaltung, {
    fields: [ticket.veranstaltungId],
    references: [veranstaltung.id],
  }),
}));
