import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Jwt } from 'hono/utils/jwt';
import { app } from '../src/app.js';
import { createAccessTokenVerifier, OrganizerRoleRequired } from '../src/auth.js';
import type { db } from '../src/db/client.js';
import { createEventRoutes } from '../src/rest/routes.js';
import { eventInput, eventQuery, placeInput, ticketInput } from '../src/rest/input.js';

test('REST lehnt nicht autorisierte und ungültige Schreibanfragen vor dem DB-Zugriff ab', async () => {
  const database = {} as typeof db;
  const disabled = createEventRoutes(database);
  assert.equal((await disabled.request('/', { method: 'POST' })).status, 503);
  const routes = createEventRoutes(database, async (authorization) => {
    if (authorization === 'Bearer reader') throw new OrganizerRoleRequired();
    if (authorization !== 'Bearer test') throw new Error('Ungültig');
    return { subject: 'owner' };
  });
  const unauthorized = await routes.request('/1/tickets', { method: 'POST' });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('WWW-Authenticate'), 'Bearer');
  const forbidden = await routes.request('/', {
    method: 'POST',
    headers: { Authorization: 'Bearer reader' },
  });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { error: 'Rolle veranstalter erforderlich.' });
  const response = await routes.request('/', {
    method: 'POST',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ titel: 'Test', datum: '2027-02-30T12:00:00Z' }),
  });
  assert.equal(response.status, 400);
  const failure = await response.json();
  assert.equal(failure.error, 'Ungültige Eingaben.');
  assert.deepEqual(
    failure.details.map(({ feld }: { feld: string }) => feld),
    ['datum', 'kategorie', 'preis'],
  );
  const query = await routes.request('/?limit=101&ab=morgen');
  assert.equal(query.status, 400);
  assert.deepEqual(
    (await query.json()).details.map(({ feld }: { feld: string }) => feld),
    ['limit', 'ab'],
  );
  const path = await routes.request('/1/tickets/0');
  assert.equal(path.status, 400);
  assert.equal((await path.json()).details[0].feld, 'ticketId');
});

test('Zod normalisiert gültige Werte und prüft die fachlichen Grenzen', () => {
  const event = {
    titel: ' Jazz ',
    datum: '2027-02-01T19:00:00+01:00',
    kategorie: 'KONZERT',
    preis: '12.50',
  };
  assert.deepEqual(eventInput.parse(event), {
    ...event,
    titel: 'Jazz',
    datum: new Date('2027-02-01T18:00:00Z'),
    schlagwoerter: [],
  });
  for (const patch of [{ preis: '1.001' }, { schlagwoerter: [1] }, { kategorie: 'UNBEKANNT' }]) {
    assert.equal(eventInput.safeParse({ ...event, ...patch }).success, false);
  }
  assert.equal(
    placeInput.safeParse({ name: 'Halle', strasse: 'Markt 1', plz: '12345' }).success,
    false,
  );
  assert.equal(
    ticketInput.safeParse({ bezeichnung: 'Standard', preis: '12.50', kontingent: -1 }).success,
    false,
  );
  assert.deepEqual(eventQuery.parse({ limit: '10', q: ' Jazz ' }), {
    limit: 10,
    offset: 0,
    q: 'Jazz',
  });
});

test('GET / und GET /health', async () => {
  for (const [path, body] of [
    ['/', { message: 'Veranstaltungs-API ist bereit' }],
    ['/health', { status: 'ok' }],
  ] as const) {
    const response = await app.request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), body);
  }
});

test('Access-Tokens werden anhand der JWKS und Claims geprüft', async () => {
  const issuer = 'https://issuer.example';
  const audience = 'veranstaltungs-api';
  const generatePair = () =>
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const { privateKey, publicKey } = await generatePair();
  const wrongKey = await generatePair();
  const key = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'test', alg: 'ES256' };
  const signingKey = {
    ...(await crypto.subtle.exportKey('jwk', privateKey)),
    kid: 'test',
    alg: 'ES256' as const,
  };
  const wrongSigningKey = {
    ...(await crypto.subtle.exportKey('jwk', wrongKey.privateKey)),
    kid: 'test',
    alg: 'ES256' as const,
  };
  const verify = createAccessTokenVerifier(
    {
      issuer,
      audience,
      jwksUrl: issuer + '/jwks',
      algorithms: ['ES256'],
    },
    async () => Response.json({ keys: [key] }),
  );
  const sign = (claims: Record<string, unknown> = {}, signer = signingKey) =>
    Jwt.sign(
      {
        iss: issuer,
        aud: audience,
        sub: 'owner',
        exp: Math.floor(Date.now() / 1000) + 60,
        ...claims,
      },
      signer,
      'ES256',
    );

  assert.deepEqual(await verify('Bearer ' + (await sign())), { subject: 'owner' });
  await assert.rejects(verify(null));
  for (const claims of [
    { iss: 'https://other.example' },
    { aud: 'other' },
    { exp: 1 },
    { exp: undefined },
    { sub: undefined },
  ]) {
    await assert.rejects(verify('Bearer ' + (await sign(claims))));
  }
  await assert.rejects(verify('Bearer ' + (await sign({}, wrongSigningKey))));

  const keycloakConfig = {
    issuer,
    audience,
    jwksUrl: issuer + '/jwks',
    algorithms: ['ES256'] as const,
    keycloakOrganizerRole: 'veranstalter',
  };
  const verifyKeycloak = createAccessTokenVerifier(keycloakConfig, async () =>
    Response.json({ keys: [key] }),
  );
  const roles = { realm_access: { roles: ['veranstalter'] } };
  assert.deepEqual(await verifyKeycloak('Bearer ' + (await sign({ typ: 'Bearer', ...roles }))), {
    subject: 'owner',
  });
  await assert.rejects(
    verifyKeycloak('Bearer ' + (await sign({ typ: 'Bearer' }))),
    OrganizerRoleRequired,
  );
  await assert.rejects(verifyKeycloak('Bearer ' + (await sign({ typ: 'ID', ...roles }))));

  const loopbackIssuer = 'http://127.0.0.1:8080/realms/veranstaltung';
  const loopbackConfig = {
    ...keycloakConfig,
    issuer: loopbackIssuer,
    jwksUrl: loopbackIssuer + '/certs',
  };
  assert.throws(() => createAccessTokenVerifier(loopbackConfig));
  assert.doesNotThrow(() =>
    createAccessTokenVerifier({ ...loopbackConfig, allowLoopbackHttp: true }),
  );
  assert.throws(() =>
    createAccessTokenVerifier({
      ...loopbackConfig,
      allowLoopbackHttp: true,
      jwksUrl: 'http://127.0.0.1:8081/certs',
    }),
  );
  assert.throws(() =>
    createAccessTokenVerifier({
      ...loopbackConfig,
      allowLoopbackHttp: true,
      issuer: 'http://example.org',
      jwksUrl: 'http://example.org/certs',
    }),
  );
});
