import { z } from 'zod';
import { boundedInteger, price, text } from './common-validation.js';

export const TicketSchema = z.object({
  bezeichnung: text(),
  preis: price,
  kontingent: boundedInteger(0),
  aktiv: z.boolean().default(true),
});

export type TicketType = z.infer<typeof TicketSchema>;
