import { defineRelations } from 'drizzle-orm';
import { ort, ticket, veranstaltung } from './schema.js';

export const relations = defineRelations(
  { ort, ticket, veranstaltung },
  (rel) => ({
    veranstaltung: {
      ort: rel.one.ort(),
      tickets: rel.many.ticket(),
    },
    ort: {
      veranstaltung: rel.one.veranstaltung({
        from: rel.ort.veranstaltungId,
        to: rel.veranstaltung.id,
      }),
    },
    ticket: {
      veranstaltung: rel.one.veranstaltung({
        from: rel.ticket.veranstaltungId,
        to: rel.veranstaltung.id,
      }),
    },
  }),
);
