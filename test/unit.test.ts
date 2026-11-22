import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jwt } from 'hono/utils/jwt';
import { app } from '../src/app.js';
import { createAccessTokenVerifier } from '../src/auth.js';
import type { db } from '../src/db/client.js';
import { createEventRoutes } from '../src/rest/routes.js';

test('REST lehnt nicht autorisierte und ungültige Schreibanfragen vor dem DB-Zugriff ab', async () => {
  const database = {} as typeof db;
  const disabled = createEventRoutes(database);
  assert.equal((await disabled.request('/', { method: 'POST' })).status, 503);
  const routes = createEventRoutes(database, async (authorization) => {
    if (authorization !== 'Bearer test') throw new Error('Ungültig');
    return { subject: 'owner' };
  });
  const unauthorized = await routes.request('/1/tickets', { method: 'POST' });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('WWW-Authenticate'), 'Bearer');
  const response = await routes.request('/', {
    method: 'POST',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ titel: 'Test', datum: '2027-02-30T12:00:00Z' }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Ungültiges Datum.' });
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
  const generatePair = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const { privateKey, publicKey } = await generatePair();
  const wrongKey = await generatePair();
  const key = { ...await crypto.subtle.exportKey('jwk', publicKey), kid: 'test', alg: 'ES256' };
  const signingKey = { ...await crypto.subtle.exportKey('jwk', privateKey), kid: 'test', alg: 'ES256' as const };
  const wrongSigningKey = { ...await crypto.subtle.exportKey('jwk', wrongKey.privateKey), kid: 'test', alg: 'ES256' as const };
  const verify = createAccessTokenVerifier({
    issuer, audience, jwksUrl: issuer + '/jwks', algorithms: ['ES256'],
  }, async () => Response.json({ keys: [key] }));
  const sign = (
    claims: Record<string, unknown> = {}, signer = signingKey,
  ) => Jwt.sign({
    iss: issuer, aud: audience, sub: 'owner', exp: Math.floor(Date.now() / 1000) + 60, ...claims,
  }, signer, 'ES256');

  assert.deepEqual(await verify('Bearer ' + await sign()), { subject: 'owner' });
  await assert.rejects(verify(null));
  for (const claims of [
    { iss: 'https://other.example' }, { aud: 'other' }, { exp: 1 }, { exp: undefined }, { sub: undefined },
  ]) {
    await assert.rejects(verify('Bearer ' + await sign(claims)));
  }
  await assert.rejects(verify('Bearer ' + await sign({}, wrongSigningKey)));
});
