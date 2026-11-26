import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { boundedInteger } from '../validation/common-validation.js';
import { SuchparameterSchema } from '../validation/veranstaltung-validation.js';

const numericParameter = (minimum: number, maximum?: number) =>
  z
    .string()
    .regex(/^\d+$/, 'Ziffern erwartet.')
    .transform(Number)
    .pipe(boundedInteger(minimum, maximum));

const id = numericParameter(1);

export const eventParams = z.object({ id });
export const ticketParams = eventParams.extend({ ticketId: id });

export const pagination = z.object({
  limit: numericParameter(1, 100).default(20),
  offset: numericParameter(0).default(0),
});

export const eventQuery = SuchparameterSchema.omit({ limit: true, offset: true });

const versionTag = z
  .string()
  .regex(/^"\d+"$/)
  .transform((value) => value.slice(1, -1));
const ifMatch = versionTag.pipe(numericParameter(0));

export const formatVersionTag = (version: number) => `"${version}"`;

export function readExpectedVersion(header: string | undefined) {
  if (header === undefined) {
    throw new HTTPException(428, { message: 'Header If-Match erforderlich.' });
  }
  const version = ifMatch.safeParse(header);
  if (!version.success || formatVersionTag(version.data) !== header) {
    throw new HTTPException(400, {
      message: 'If-Match muss den ETag der Veranstaltung enthalten.',
    });
  }
  return version.data;
}

export class ValidationError extends HTTPException {
  constructor(
    readonly details: { feld: string; nachricht: string }[],
    statusCode: 400 | 422 = 400,
  ) {
    super(statusCode, { message: 'Ungültige Eingaben.' });
  }
}

export function validate<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  statusCode: 400 | 422 = 400,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        feld: issue.path.join('.') || 'body',
        nachricht: issue.message,
      })),
      statusCode,
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
  return validate(schema, body, 422);
}
