import { z } from 'zod';
import type { veranstaltung } from '../../db/schema.js';
import type { Suchparameter } from '../service/suchparameter.js';
import { boundedInteger } from '../validation/common-validation.js';
import type { OrtSchema } from '../validation/ort-validation.js';
import type { TicketSchema } from '../validation/ticket-validation.js';
import {
  SuchparameterSchema,
  type VeranstaltungSchema,
} from '../validation/veranstaltung-validation.js';

type VeranstaltungSelect = typeof veranstaltung.$inferSelect;

export type VeranstaltungInput = z.input<typeof VeranstaltungSchema>;
export type OrtInput = z.input<typeof OrtSchema>;
export type TicketInput = z.input<typeof TicketSchema>;

export type Veranstaltung = Omit<
  VeranstaltungSelect,
  'id' | 'datum' | 'erstellt' | 'aktualisiert'
> & {
  id: string;
  datum: string;
  erstellt: string;
  aktualisiert: string;
};

export type SuchParameterInput = {
  [Key in keyof Suchparameter]?: (Key extends 'ab' ? string : Suchparameter[Key]) | null;
};

const idSchema = z.string().regex(/^\d+$/).transform(Number).pipe(boundedInteger(1));

export const toNumber = (id: string) => idSchema.parse(id);

export const toVeranstaltungType = (row: VeranstaltungSelect): Veranstaltung => ({
  ...row,
  id: String(row.id),
  datum: row.datum.toISOString(),
  erstellt: row.erstellt.toISOString(),
  aktualisiert: row.aktualisiert.toISOString(),
});

export const toSuchparameter = (input?: SuchParameterInput | null) =>
  SuchparameterSchema.parse(
    Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== null)),
  );
