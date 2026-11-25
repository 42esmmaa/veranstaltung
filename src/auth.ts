import { Jwt } from 'hono/utils/jwt';

type Algorithm = 'RS256' | 'PS256' | 'ES256';
type Keys = NonNullable<Parameters<typeof Jwt.verifyWithJwks>[1]['keys']>;

export interface AccessTokenConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  algorithms: readonly Algorithm[];
  allowLoopbackHttp?: boolean;
  keycloakOrganizerRole?: string;
}

export interface Organizer {
  readonly subject: string;
}

export class OrganizerRoleRequired extends Error {}

export function createAccessTokenVerifier(
  config: AccessTokenConfig,
  fetchJwks: typeof fetch = fetch,
) {
  const jwksUrl = new URL(config.jwksUrl);
  const issuerUrl = new URL(config.issuer);
  const allowedUrl = (url: URL) =>
    !url.username &&
    !url.password &&
    (url.protocol === 'https:' ||
      (config.allowLoopbackHttp &&
        config.keycloakOrganizerRole &&
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1' &&
        url.origin === issuerUrl.origin));
  if (
    !allowedUrl(jwksUrl) ||
    !allowedUrl(issuerUrl) ||
    !config.audience ||
    !config.algorithms.length ||
    config.algorithms.some((algorithm) => !['RS256', 'PS256', 'ES256'].includes(algorithm))
  ) {
    throw new Error('Ungültige Access-Token-Konfiguration.');
  }

  const algorithms = [...config.algorithms];
  const verification = { iss: config.issuer, aud: config.audience };
  const organizerRole = config.keycloakOrganizerRole;
  let cached: { keys: Keys; expiresAt: number } | undefined;
  let pending: Promise<Keys> | undefined;
  async function loadKeys() {
    if (cached && Date.now() < cached.expiresAt) {
      return cached.keys;
    }
    pending ??= (async () => {
      const response = await fetchJwks(jwksUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error('JWKS konnte nicht geladen werden.');
      }
      const body = (await response.json()) as { keys?: Keys };
      if (!Array.isArray(body?.keys) || !body.keys.every((key) => key && typeof key === 'object')) {
        throw new Error('Ungültiges JWKS.');
      }
      cached = { keys: body.keys, expiresAt: Date.now() + 60_000 };
      return cached.keys;
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  }
  return async (authorization: string | null): Promise<Organizer> => {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (!token) {
      throw new Error('Bearer-Token fehlt.');
    }
    const {
      header: { alg, kid },
    } = Jwt.decode(token);
    if (!kid || !algorithms.some((algorithm) => algorithm === alg)) {
      throw new Error('Nicht unterstützter Token-Header.');
    }
    const payload = await Jwt.verifyWithJwks(token, {
      keys: await loadKeys(),
      allowedAlgorithms: algorithms,
      verification,
    });
    if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new Error('Verpflichtende Token-Claims fehlen.');
    }
    if (organizerRole) {
      if (payload.typ !== 'Bearer') {
        throw new Error('Keycloak-Access-Token erforderlich.');
      }
      const realmAccess = payload.realm_access;
      if (
        typeof realmAccess !== 'object' ||
        realmAccess === null ||
        !('roles' in realmAccess) ||
        !Array.isArray(realmAccess.roles) ||
        !realmAccess.roles.includes(organizerRole)
      ) {
        throw new OrganizerRoleRequired();
      }
    }
    return { subject: payload.sub };
  };
}
