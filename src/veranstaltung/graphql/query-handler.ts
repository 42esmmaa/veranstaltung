import { GraphQLError } from 'graphql';
import { ZodError } from 'zod';
import type { db } from '../../db/client.js';
import { NotFoundError } from '../service/errors.js';
import {
  find,
  findById,
  findOrtByVeranstaltungId,
  findTicketsByVeranstaltungId,
} from '../service/veranstaltung-service.js';
import { SuchparameterSchema } from '../validation/veranstaltung-validation.js';
import {
  type SuchParameterInput,
  toNumber,
  toSuchparameter,
  toVeranstaltungType,
} from './types.js';

const pageableSchema = SuchparameterSchema.pick({ limit: true, offset: true });

const queryError = (error: unknown): never => {
  if (error instanceof NotFoundError) {
    throw new GraphQLError(error.message, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  if (error instanceof ZodError) {
    throw new GraphQLError('Ungültige Eingaben.', {
      extensions: {
        code: 'BAD_USER_INPUT',
        details: error.issues.map((issue) => ({
          feld: issue.path.join('.') || 'input',
          nachricht: issue.message,
        })),
      },
    });
  }
  throw error;
};

export const veranstaltungHandler = async (database: typeof db, id: string) => {
  try {
    return toVeranstaltungType(await findById(database, toNumber(id)));
  } catch (error) {
    return queryError(error);
  }
};

export const veranstaltungenHandler = async (
  database: typeof db,
  input?: SuchParameterInput | null,
) => {
  try {
    const rows = await find(database, toSuchparameter(input));
    return rows.map(toVeranstaltungType);
  } catch (error) {
    return queryError(error);
  }
};

export const ortHandler = async (database: typeof db, id: string) => {
  try {
    return await findOrtByVeranstaltungId(database, toNumber(id));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    return queryError(error);
  }
};

export const ticketsHandler = async (
  database: typeof db,
  id: string,
  pageable: { limit: number; offset: number },
) => {
  try {
    return await findTicketsByVeranstaltungId(
      database,
      toNumber(id),
      pageableSchema.parse(pageable),
    );
  } catch (error) {
    return queryError(error);
  }
};
