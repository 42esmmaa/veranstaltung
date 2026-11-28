import { serve } from '@hono/node-server';
import { createApp } from './app.mts';
import { createAccessTokenVerifier } from './auth.js';
import { db } from './db/client.js';
import { getLogger } from './logger/logger.mts';

const port = Number(process.env['PORT'] ?? 3000);
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
        allowLoopbackHttp: process.env['OIDC_ALLOW_LOOPBACK_HTTP'] === 'true',
        keycloakOrganizerRole: 'veranstalter',
      })
    : undefined;
const app = createApp(db, verify, undefined, process.env['METRICS_ENABLED'] === 'true');

serve({ fetch: app.fetch, port }, (info) => {
  getLogger('index').info(
    { port: info.port, nodeVersion: process.version },
    'Appserver gestartet.',
  );
});
