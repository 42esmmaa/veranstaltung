import { serve } from '@hono/node-server';
import { app } from './app.js';
import { createAccessTokenVerifier } from './auth.js';
import { db } from './db/client.js';
import { createEventRoutes } from './rest/routes.js';
import { createGraphqlApp } from './veranstaltung/graphql/graphql-app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT muss eine ganze Zahl zwischen 1 und 65535 sein.');
}

const { OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL } = process.env;
if (
  [OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL].some(Boolean) &&
  !(OIDC_ISSUER && OIDC_AUDIENCE && OIDC_JWKS_URL)
) {
  throw new Error('OIDC_ISSUER, OIDC_AUDIENCE und OIDC_JWKS_URL gemeinsam setzen.');
}
const verify =
  OIDC_ISSUER && OIDC_AUDIENCE && OIDC_JWKS_URL
    ? createAccessTokenVerifier({
        issuer: OIDC_ISSUER,
        audience: OIDC_AUDIENCE,
        jwksUrl: OIDC_JWKS_URL,
        algorithms: ['RS256'],
        allowLoopbackHttp: process.env.OIDC_ALLOW_LOOPBACK_HTTP === 'true',
        keycloakOrganizerRole: 'veranstalter',
      })
    : undefined;
app.route('/veranstaltungen', createEventRoutes(db, verify));
app.route('/', createGraphqlApp(db));

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`Veranstaltungs-API läuft auf http://localhost:${info.port}`);
});
