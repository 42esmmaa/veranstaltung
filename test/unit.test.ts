import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Jwt } from 'hono/utils/jwt';
import { app } from '../src/app.js';
import { createAccessTokenVerifier } from '../src/auth.js';

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
