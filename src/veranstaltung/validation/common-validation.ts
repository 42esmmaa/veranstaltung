import { z } from 'zod';

const maximumInteger = 2_147_483_647;

export const boundedInteger = (minimum: number, maximum = maximumInteger) =>
  z.number().int().min(minimum).max(maximum);

export const text = (limit = 200) =>
  z
    .string()
    .trim()
    .min(1)
    .max(limit)
    .refine((value) => !value.includes('\0'), 'Nullzeichen sind nicht erlaubt.');

export const date = z.iso
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

export const price = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Dezimalstring mit bis zu zwei Nachkommastellen erwartet.');
