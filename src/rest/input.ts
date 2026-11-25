import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { kategorieEnum } from '../db/schema.js';

const maximumInteger = 2_147_483_647;
const boundedInteger = (minimum: number, maximum = maximumInteger) =>
  z.number().int().min(minimum).max(maximum);

const numericParameter = (minimum: number, maximum?: number) =>
  z
    .string()
    .regex(/^\d+$/, 'Ziffern erwartet.')
    .transform(Number)
    .pipe(boundedInteger(minimum, maximum));

const text = (limit = 200) =>
  z
    .string()
    .trim()
    .min(1)
    .max(limit)
    .refine((value) => !value.includes('\0'), 'Nullzeichen sind nicht erlaubt.');

const date = z.iso
  .datetime({ offset: true })
  .pipe(
    z
      .string()
      .refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
          !value.startsWith('0000') &&
          Number.isFinite(Date.parse(value)),
        'ISO-8601-Zeitpunkt mit Sekunden und Offset erwartet.',
      ),
  )
  .transform((value) => new Date(value));

const category = z.enum(kategorieEnum.enumValues);
const price = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Dezimalstring mit bis zu zwei Nachkommastellen erwartet.');
const id = numericParameter(1);

export const eventParams = z.object({ id });
export const ticketParams = eventParams.extend({ ticketId: id });

export const pagination = z.object({
  limit: numericParameter(1, 100).default(20),
  offset: numericParameter(0).default(0),
});

export const eventQuery = pagination.extend({
  q: text().optional(),
  kategorie: category.optional(),
  ab: date.optional(),
  schlagwort: text(50).optional(),
});

export const eventInput = z.object({
  titel: text(),
  datum: date,
  kategorie: category,
  preis: price,
  schlagwoerter: z.array(text(50)).max(30).default([]),
});

export const placeInput = z.object({
  name: text(),
  strasse: text(),
  plz: text(20),
  stadt: text(),
});

export const ticketInput = z.object({
  bezeichnung: text(),
  preis: price,
  kontingent: boundedInteger(0),
  aktiv: z.boolean().default(true),
});

export class ValidationError extends HTTPException {
  constructor(readonly details: { feld: string; nachricht: string }[]) {
    super(400, { message: 'Ungültige Eingaben.' });
  }
}

export function validate<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        feld: issue.path.join('.') || 'body',
        nachricht: issue.message,
      })),
    );
  }
  return result.data;
}

export async function readBody<Schema extends z.ZodType>(schema: Schema, request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new HTTPException(415, { message: 'Content-Type application/json erforderlich.' });
  }
  const body: unknown = await request.json().catch(() => {
    throw new ValidationError([{ feld: 'body', nachricht: 'Ungültiges JSON.' }]);
  });
  return validate(schema, body);
}
