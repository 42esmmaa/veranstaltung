import type { db } from '../../db/client.js';
import { NotFoundError } from '../service/errors.js';
import {
  find,
  findById,
  findOrtByVeranstaltungId,
  findTicketsByVeranstaltungId,
} from '../service/veranstaltung-service.js';
import { SuchparameterSchema } from '../validation/veranstaltung-validation.js';
import { handleError } from './errors.js';
import {
  type SuchParameterInput,
  toNumber,
  toSuchparameter,
  toVeranstaltungType,
} from './types.js';

const pageableSchema = SuchparameterSchema.pick({ limit: true, offset: true });

export const veranstaltungHandler = async (database: typeof db, id: string) => {
  try {
    return toVeranstaltungType(await findById(database, toNumber(id)));
  } catch (error) {
    return handleError(error);
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
    return handleError(error);
  }
};

export const ortHandler = async (database: typeof db, id: string) => {
  try {
    return await findOrtByVeranstaltungId(database, toNumber(id));
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    return handleError(error);
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
    return handleError(error);
  }
};
