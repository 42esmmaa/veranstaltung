import { z } from 'zod';
import { kategorieEnum } from '../../db/schema.js';
import { date, price, text } from './common-validation.js';

export const VeranstaltungSchema = z.object({
  titel: text(),
  datum: date,
  kategorie: z.enum(kategorieEnum.enumValues),
  preis: price,
  schlagwoerter: z.array(text(50)).max(30).default([]),
});

export type VeranstaltungType = z.infer<typeof VeranstaltungSchema>;
