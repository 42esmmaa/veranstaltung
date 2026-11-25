import { z } from 'zod';
import { text } from './common-validation.js';

export const OrtSchema = z.object({
  name: text(),
  strasse: text(),
  plz: text(20),
  stadt: text(),
});

export type OrtType = z.infer<typeof OrtSchema>;
