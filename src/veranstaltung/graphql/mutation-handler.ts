import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import { deleteFn, insert, update } from '../service/veranstaltung-write-service.js';
import { VeranstaltungSchema } from '../validation/veranstaltung-validation.js';
import { handleError } from './errors.js';
import { type VeranstaltungInput, toNumber, toVeranstaltungType } from './types.js';

export const createHandler = async (
  database: typeof db,
  input: VeranstaltungInput,
  organizer: Organizer,
) => {
  try {
    const values = VeranstaltungSchema.parse(input);
    return toVeranstaltungType(await insert(database, values, organizer));
  } catch (error) {
    return handleError(error);
  }
};

export const updateHandler = async (
  database: typeof db,
  id: string,
  input: VeranstaltungInput,
  organizer: Organizer,
) => {
  try {
    const values = VeranstaltungSchema.parse(input);
    return toVeranstaltungType(await update(database, toNumber(id), values, organizer));
  } catch (error) {
    return handleError(error);
  }
};

export const deleteHandler = async (database: typeof db, id: string, organizer: Organizer) => {
  try {
    await deleteFn(database, toNumber(id), organizer);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
};
