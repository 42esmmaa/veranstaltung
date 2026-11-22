import { HTTPException } from 'hono/http-exception';
import { kategorieEnum } from '../db/schema.js';

export function invalid(message: string): never {
  throw new HTTPException(400, { message });
}

export function integer(value: unknown, field: string, minimum: number, maximum = 2_147_483_647) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(`${field} muss eine ganze Zahl zwischen ${minimum} und ${maximum} sein.`);
  }
  return value;
}

export function parameter(value: string, field: string, minimum = 1, maximum?: number) {
  return integer(/^\d+$/.test(value) ? Number(value) : NaN, field, minimum, maximum);
}

export function text(value: unknown, field: string, limit = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || value.includes('\0')) {
    invalid(`${field} muss Text mit 1 bis ${limit} Zeichen enthalten.`);
  }
  return value.trim();
}

export function category(value: unknown) {
  const match = kategorieEnum.enumValues.find((entry) => value === entry);
  return match ?? invalid('Unbekannte Kategorie.');
}

export function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    invalid('Datum muss ein ISO-8601-Zeitpunkt mit Offset sein.');
  }
  const parsed = new Date(value);
  const day = new Date(value.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== value.slice(0, 10) || value.startsWith('0000') ||
      Number(value.slice(11, 13)) > 23) {
    invalid('Ungültiges Datum.');
  }
  return parsed;
}

function price(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) {
    invalid('Preis muss ein nichtnegativer Dezimalstring mit höchstens zwei Nachkommastellen sein.');
  }
  return value;
}

export async function input(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HTTPException(415, { message: 'Content-Type application/json erforderlich.' });
  }
  const body: unknown = await request.json().catch(() => invalid('Ungültiges JSON.'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('JSON-Objekt erforderlich.');
  return body as Record<string, unknown>;
}

export function eventData(body: Record<string, unknown>) {
  const tags = body.schlagwoerter === undefined ? [] : body.schlagwoerter;
  if (!Array.isArray(tags) || tags.length > 30) invalid('Höchstens 30 Schlagwörter erlaubt.');
  return {
    titel: text(body.titel, 'titel'),
    datum: date(body.datum),
    kategorie: category(body.kategorie),
    preis: price(body.preis),
    schlagwoerter: tags.map((tag: unknown) => text(tag, 'schlagwoerter', 50)),
  };
}

export function placeData(body: Record<string, unknown>) {
  return {
    name: text(body.name, 'name'),
    strasse: text(body.strasse, 'strasse'),
    plz: text(body.plz, 'plz', 20),
    stadt: text(body.stadt, 'stadt'),
  };
}

export function ticketData(body: Record<string, unknown>) {
  const active = body.aktiv === undefined ? true : body.aktiv;
  if (typeof active !== 'boolean') invalid('aktiv muss ein Boolean sein.');
  return {
    bezeichnung: text(body.bezeichnung, 'bezeichnung'),
    preis: price(body.preis),
    kontingent: integer(body.kontingent, 'kontingent', 0),
    aktiv: active,
  };
}
