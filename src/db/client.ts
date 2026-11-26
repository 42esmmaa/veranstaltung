import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolConfig } from 'pg';
import { relations } from './relations.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL ist nicht gesetzt. Bitte die lokale .env-Datei prüfen.');
}

const connection: PoolConfig = { connectionString: databaseUrl };
export const db = drizzle({ connection, relations });
