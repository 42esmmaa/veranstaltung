import assert from 'node:assert/strict';
import { test } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { app } from '../src/app.js';
import { createAccessTokenVerifier, OrganizerRoleRequired } from '../src/auth.js';
import type { db } from '../src/db/client.js';
import { createEventRoutes } from '../src/rest/routes.js';
import { eventQuery } from '../src/rest/input.js';
import { OrtSchema } from '../src/veranstaltung/validation/ort-validation.js';
import { TicketSchema } from '../src/veranstaltung/validation/ticket-validation.js';
import { VeranstaltungSchema } from '../src/veranstaltung/validation/veranstaltung-validation.js';
import { createGraphqlApp } from '../src/veranstaltung/graphql/graphql-app.js';

test('REST lehnt nicht autorisierte und ungültige Schreibanfragen vor dem DB-Zugriff ab', async () => {
  const database = {} as typeof db;
  const disabled = createEventRoutes(database);
  assert.equal((await disabled.request('/', { method: 'POST' })).status, 503);
  const routes = createEventRoutes(database, async (authorization) => {
    if (authorization === 'Bearer reader') {
      throw new OrganizerRoleRequired();
    }
    if (authorization !== 'Bearer test') {
      throw new Error('Ungültig');
    }
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
  assert.deepEqual(VeranstaltungSchema.parse(event), {
    ...event,
    titel: 'Jazz',
    datum: new Date('2027-02-01T18:00:00Z'),
    schlagwoerter: [],
  });
  for (const patch of [{ preis: '1.001' }, { schlagwoerter: [1] }, { kategorie: 'UNBEKANNT' }]) {
    assert.equal(VeranstaltungSchema.safeParse({ ...event, ...patch }).success, false);
  }
  assert.equal(
    OrtSchema.safeParse({ name: 'Halle', strasse: 'Markt 1', plz: '12345' }).success,
    false,
  );
  assert.equal(
    TicketSchema.safeParse({ bezeichnung: 'Standard', preis: '12.50', kontingent: -1 }).success,
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

test('GraphQL validiert IDs und Suchparameter vor dem DB-Zugriff', async () => {
  const graphql = createGraphqlApp({} as typeof db);
  const query = (value: string) =>
    graphql.request('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: value }),
    });
  const ready = await query('{ __typename }');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { data: { __typename: 'Query' } });
  for (const value of [
    '{ veranstaltung(id: "1abc") { id } }',
    '{ veranstaltung(id: "0") { id } }',
    '{ veranstaltung(id: "2147483648") { id } }',
    '{ veranstaltungen(input: { limit: 101 }) { id } }',
    '{ veranstaltungen(input: { offset: -1 }) { id } }',
    '{ veranstaltungen(input: { ab: "morgen" }) { id } }',
  ]) {
    const response = await query(value);
    const result = await response.json();
    assert.equal(result.errors[0].extensions.code, 'BAD_USER_INPUT');
  }
});

test('RS256-Keycloak-Tokens verwenden zwischengespeicherte Signaturschlüssel', async () => {
  const issuer = 'https://issuer.example/realms/veranstaltung';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = { ...(await exportJWK(publicKey)), kid: 'keycloak-test', alg: 'RS256' };
  let requests = 0;
  const verify = createAccessTokenVerifier(
    {
      issuer,
      audience: 'veranstaltungs-api',
      jwksUrl: issuer + '/protocol/openid-connect/certs',
      algorithms: ['RS256'],
      keycloakOrganizerRole: 'veranstalter',
    },
    async () => {
      requests += 1;
      return Response.json({ keys: [key] });
    },
  );
  const token = await new SignJWT({
    typ: 'Bearer',
    realm_access: { roles: ['veranstalter'] },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'keycloak-test' })
    .setIssuer(issuer)
    .setAudience('veranstaltungs-api')
    .setSubject('owner')
    .setExpirationTime('1m')
    .sign(privateKey);

  assert.deepEqual(await verify('Bearer ' + token), { subject: 'owner' });
  assert.deepEqual(await verify('Bearer ' + token), { subject: 'owner' });
  assert.equal(requests, 1);
  const graphql = createGraphqlApp({} as typeof db, verify);
  const response = await graphql.request('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ query: 'mutation { delete(id: "0") { success } }' }),
  });
  assert.equal((await response.json()).errors[0].extensions.code, 'BAD_USER_INPUT');
});

test('GraphQL schützt alle Veranstaltungsmutationen vor dem DB-Zugriff', async () => {
  const database = {} as typeof db;
  const disabled = createGraphqlApp(database);
  const graphql = createGraphqlApp(database, async (authorization) => {
    if (authorization === 'Bearer reader') {
      throw new OrganizerRoleRequired();
    }
    if (authorization !== 'Bearer owner') {
      throw new Error('Ungültig');
    }
    return { subject: 'owner' };
  });
  const input = {
    titel: 'Test',
    datum: '2027-02-30T12:00:00Z',
    kategorie: 'KONZERT',
    preis: '12.50',
  };
  const request = async (target: typeof graphql, query: string, authorization?: string) => {
    const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
    if (authorization) {
      headers.set('Authorization', authorization);
    }
    const response = await target.request('/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: { input } }),
    });
    return response.json();
  };
  for (const query of [
    'mutation($input: VeranstaltungInput!) { create(input: $input) { id } }',
    'mutation($input: VeranstaltungInput!) { update(id: "1", input: $input) { id } }',
    'mutation { delete(id: "0") { success } }',
  ]) {
    assert.equal((await request(disabled, query)).errors[0].extensions.code, 'SERVICE_UNAVAILABLE');
    for (const [authorization, code] of [
      [undefined, 'UNAUTHENTICATED'],
      ['Bearer invalid', 'UNAUTHENTICATED'],
      ['Bearer reader', 'FORBIDDEN'],
      ['Bearer owner', 'BAD_USER_INPUT'],
    ] as const) {
      assert.equal((await request(graphql, query, authorization)).errors[0].extensions.code, code);
    }
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
  const verify = createAccessTokenVerifier(
    {
      issuer,
      audience,
      jwksUrl: issuer + '/jwks',
      algorithms: ['ES256'],
    },
    async () => Response.json({ keys: [key] }),
  );
  const sign = (claims: Record<string, unknown> = {}, signer = privateKey) =>
    new SignJWT({
      iss: issuer,
      aud: audience,
      sub: 'owner',
      exp: Math.floor(Date.now() / 1000) + 60,
      ...claims,
    })
      .setProtectedHeader({ kid: 'test', alg: 'ES256' })
      .sign(signer);

  assert.deepEqual(await verify('Bearer ' + (await sign())), { subject: 'owner' });
  await assert.rejects(verify(null));
  for (const claims of [
    { iss: 'https://other.example' },
    { aud: 'other' },
    { exp: 1 },
    { exp: undefined },
    { sub: undefined },
    { sub: ' ' },
    { iss: undefined },
    { aud: undefined },
    { nbf: Math.floor(Date.now() / 1000) + 120 },
  ]) {
    await assert.rejects(verify('Bearer ' + (await sign(claims))));
  }
  await assert.rejects(verify('Bearer ' + (await sign({}, wrongKey.privateKey))));
  const claims = {
    iss: issuer,
    aud: audience,
    sub: 'owner',
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const withoutKid = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256' })
    .sign(privateKey);
  await assert.rejects(verify('Bearer ' + withoutKid));
  const symmetricToken = await new SignJWT(claims)
    .setProtectedHeader({ kid: 'test', alg: 'HS256' })
    .sign(crypto.getRandomValues(new Uint8Array(32)));
  await assert.rejects(verify('Bearer ' + symmetricToken));

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
