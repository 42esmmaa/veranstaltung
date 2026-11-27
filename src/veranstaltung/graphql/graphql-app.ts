import { createSchema, createYoga, type Plugin } from 'graphql-yoga';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { AccessTokenVerifier } from '../../auth.js';
import type { db } from '../../db/client.js';
import { getLogger, type LoggingVariables } from '../../logger/logger.mts';
import {
  createHandler,
  createTicketHandler,
  deleteHandler,
  deleteOrtHandler,
  deleteTicketHandler,
  updateHandler,
  updateOrtHandler,
  updateTicketHandler,
} from './mutation-handler.js';
import { rolesRequired } from './roles-required.js';
import {
  ortHandler,
  ticketHandler,
  ticketsHandler,
  veranstaltungenHandler,
  veranstaltungHandler,
} from './query-handler.js';
import { typeDefs } from './schema.js';
import type {
  OrtInput,
  SuchParameterInput,
  TicketInput,
  Veranstaltung,
  VeranstaltungInput,
} from './types.js';

type GraphqlContext = { request: Request; requestLogger: Logger };

export function createGraphqlApp(database: typeof db, verify?: AccessTokenVerifier) {
  const resolvers = {
    Query: {
      veranstaltung: (_: unknown, { id }: { id: string }) => veranstaltungHandler(database, id),
      veranstaltungen: (_: unknown, { input }: { input?: SuchParameterInput | null }) =>
        veranstaltungenHandler(database, input),
    },
    Mutation: {
      create: async (
        _: unknown,
        { input }: { input: VeranstaltungInput },
        { request }: GraphqlContext,
      ) => createHandler(database, input, await rolesRequired(request, verify)),
      update: async (
        _: unknown,
        { id, version, input }: { id: string; version: number; input: VeranstaltungInput },
        { request }: GraphqlContext,
      ) => updateHandler(database, id, version, input, await rolesRequired(request, verify)),
      delete: async (_: unknown, { id }: { id: string }, { request }: GraphqlContext) =>
        deleteHandler(database, id, await rolesRequired(request, verify)),
      updateOrt: async (
        _: unknown,
        { veranstaltungId, input }: { veranstaltungId: string; input: OrtInput },
        { request }: GraphqlContext,
      ) => updateOrtHandler(database, veranstaltungId, input, await rolesRequired(request, verify)),
      deleteOrt: async (
        _: unknown,
        { veranstaltungId }: { veranstaltungId: string },
        { request }: GraphqlContext,
      ) => deleteOrtHandler(database, veranstaltungId, await rolesRequired(request, verify)),
      createTicket: async (
        _: unknown,
        { veranstaltungId, input }: { veranstaltungId: string; input: TicketInput },
        { request }: GraphqlContext,
      ) =>
        createTicketHandler(database, veranstaltungId, input, await rolesRequired(request, verify)),
      updateTicket: async (
        _: unknown,
        { veranstaltungId, id, input }: { veranstaltungId: string; id: string; input: TicketInput },
        { request }: GraphqlContext,
      ) =>
        updateTicketHandler(
          database,
          veranstaltungId,
          id,
          input,
          await rolesRequired(request, verify),
        ),
      deleteTicket: async (
        _: unknown,
        { veranstaltungId, id }: { veranstaltungId: string; id: string },
        { request }: GraphqlContext,
      ) => deleteTicketHandler(database, veranstaltungId, id, await rolesRequired(request, verify)),
    },
    Veranstaltung: {
      ort: ({ id }: Veranstaltung) => ortHandler(database, id),
      tickets: ({ id }: Veranstaltung, pageable: { limit: number; offset: number }) =>
        ticketsHandler(database, id, pageable),
      ticket: ({ id: veranstaltungId }: Veranstaltung, { id }: { id: string }) =>
        ticketHandler(database, veranstaltungId, id),
    },
  };
  const yogaServer = createYoga<{ requestLogger: Logger }>({
    schema: createSchema({ typeDefs, resolvers }),
    graphqlEndpoint: '/graphql',
    graphiql: false,
    logging: false,
    requestId: false,
    plugins: [
      {
        onResultProcess({ result, serverContext }) {
          const errors = Array.isArray(result)
            ? result.flatMap((entry) => entry.errors ?? [])
            : 'errors' in result
              ? (result.errors ?? [])
              : [];
          if (errors.length > 0) {
            serverContext.requestLogger.warn(
              { errorCount: errors.length },
              'GraphQL-Anfrage enthält Fehler.',
            );
          }
        },
      } satisfies Plugin<GraphqlContext, Pick<GraphqlContext, 'requestLogger'>>,
    ],
  });
  const app = new Hono<{ Variables: Partial<LoggingVariables> }>();
  app.post('/graphql', async (c) => {
    const response = await yogaServer.fetch(c.req.raw, {
      requestLogger: c.get('requestLogger') ?? getLogger('graphql'),
    });
    return c.newResponse(response.body, response);
  });
  return app;
}
