import { createSchema, createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import type { db } from '../../db/client.js';
import {
  ortHandler,
  ticketsHandler,
  veranstaltungenHandler,
  veranstaltungHandler,
} from './query-handler.js';
import { typeDefs } from './schema.js';
import type { SuchParameterInput, Veranstaltung } from './types.js';

export function createGraphqlApp(database: typeof db) {
  const resolvers = {
    Query: {
      veranstaltung: (_: unknown, { id }: { id: string }) => veranstaltungHandler(database, id),
      veranstaltungen: (_: unknown, { input }: { input?: SuchParameterInput | null }) =>
        veranstaltungenHandler(database, input),
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
