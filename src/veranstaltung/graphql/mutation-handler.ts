import type { Organizer } from '../../auth.js';
import type { db } from '../../db/client.js';
import {
  deleteFn,
  deleteOrt,
  deleteTicket,
  insert,
  insertTicket,
  update,
  updateOrt,
  updateTicket,
} from '../service/veranstaltung-write-service.js';
import { boundedInteger } from '../validation/common-validation.js';
import { OrtSchema } from '../validation/ort-validation.js';
import { TicketSchema } from '../validation/ticket-validation.js';
import { VeranstaltungSchema } from '../validation/veranstaltung-validation.js';
import { handleError } from './errors.js';
import {
  type OrtInput,
  type TicketInput,
  type VeranstaltungInput,
  toNumber,
  toVeranstaltungType,
} from './types.js';

const versionSchema = boundedInteger(0);

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
  version: number,
  input: VeranstaltungInput,
  organizer: Organizer,
) => {
  try {
    const values = VeranstaltungSchema.parse(input);
    const expectedVersion = versionSchema.parse(version);
    const row = await update(database, toNumber(id), expectedVersion, values, organizer);
    return toVeranstaltungType(row);
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

export const updateOrtHandler = async (
  database: typeof db,
  veranstaltungId: string,
  input: OrtInput,
  organizer: Organizer,
) => {
  try {
    const values = OrtSchema.parse(input);
    const { row } = await updateOrt(database, toNumber(veranstaltungId), values, organizer);
    return row;
  } catch (error) {
    return handleError(error);
  }
};

export const deleteOrtHandler = async (
  database: typeof db,
  veranstaltungId: string,
  organizer: Organizer,
) => {
  try {
    await deleteOrt(database, toNumber(veranstaltungId), organizer);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
};

export const createTicketHandler = async (
  database: typeof db,
  veranstaltungId: string,
  input: TicketInput,
  organizer: Organizer,
) => {
  try {
    const values = TicketSchema.parse(input);
    return await insertTicket(database, toNumber(veranstaltungId), values, organizer);
  } catch (error) {
    return handleError(error);
  }
};

export const updateTicketHandler = async (
  database: typeof db,
  veranstaltungId: string,
  id: string,
  input: TicketInput,
  organizer: Organizer,
) => {
  try {
    const values = TicketSchema.parse(input);
    return await updateTicket(database, toNumber(veranstaltungId), toNumber(id), values, organizer);
  } catch (error) {
    return handleError(error);
  }
};

export const deleteTicketHandler = async (
  database: typeof db,
  veranstaltungId: string,
  id: string,
  organizer: Organizer,
) => {
  try {
    await deleteTicket(database, toNumber(veranstaltungId), toNumber(id), organizer);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
};
