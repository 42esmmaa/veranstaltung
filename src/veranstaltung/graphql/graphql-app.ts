import { createSchema, createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import type { AccessTokenVerifier } from '../../auth.js';
import type { db } from '../../db/client.js';
import { createHandler, deleteHandler, updateHandler } from './mutation-handler.js';
import { rolesRequired } from './roles-required.js';
import {
  ortHandler,
  ticketsHandler,
  veranstaltungenHandler,
  veranstaltungHandler,
} from './query-handler.js';
import { typeDefs } from './schema.js';
import type { SuchParameterInput, Veranstaltung, VeranstaltungInput } from './types.js';

type GraphqlContext = { request: Request };

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
        { id, input }: { id: string; input: VeranstaltungInput },
        { request }: GraphqlContext,
      ) => updateHandler(database, id, input, await rolesRequired(request, verify)),
      delete: async (_: unknown, { id }: { id: string }, { request }: GraphqlContext) =>
        deleteHandler(database, id, await rolesRequired(request, verify)),
    },
    Veranstaltung: {
      ort: ({ id }: Veranstaltung) => ortHandler(database, id),
      tickets: ({ id }: Veranstaltung, pageable: { limit: number; offset: number }) =>
        ticketsHandler(database, id, pageable),
    },
  };
  const yogaServer = createYoga({
    schema: createSchema({ typeDefs, resolvers }),
    graphqlEndpoint: '/graphql',
    graphiql: false,
  });
  const app = new Hono();
  app.post('/graphql', async (c) => {
    const response = await yogaServer.fetch(c.req.raw);
    return c.newResponse(response.body, response);
  });
  return app;
}
