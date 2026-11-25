import type { z } from 'zod';
import type { SuchparameterSchema } from '../validation/veranstaltung-validation.js';

export type Suchparameter = Readonly<z.infer<typeof SuchparameterSchema>>;
