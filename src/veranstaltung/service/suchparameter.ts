import type { veranstaltung } from '../../db/schema.js';

export type Suchparameter = {
  readonly q?: string;
  readonly kategorie?: typeof veranstaltung.$inferSelect.kategorie;
  readonly ab?: Date;
  readonly schlagwort?: string;
  readonly limit: number;
  readonly offset: number;
};
