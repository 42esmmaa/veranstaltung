import { z } from 'zod';
import { kategorieEnum } from '../../db/schema.js';
import { boundedInteger, date, price, text } from './common-validation.js';

export const VeranstaltungSchema = z.object({
  titel: text(),
  datum: date,
  kategorie: z.enum(kategorieEnum.enumValues),
  preis: price,
  schlagwoerter: z.array(text(50)).max(30).default([]),
});

export type VeranstaltungType = z.infer<typeof VeranstaltungSchema>;

export const SuchparameterSchema = z.object({
  limit: boundedInteger(1, 100).default(20),
  offset: boundedInteger(0).default(0),
  q: text().optional(),
  kategorie: VeranstaltungSchema.shape.kategorie.optional(),
  ab: date.optional(),
  schlagwort: text(50).optional(),
});
