import { createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify } from 'jose';

type Algorithm = 'RS256' | 'PS256' | 'ES256';

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

export type AccessTokenVerifier = (authorization: string | null) => Promise<Organizer>;

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
  const jwks = createRemoteJWKSet(jwksUrl, {
    cacheMaxAge: 60_000,
    [customFetch]: (url, options) => fetchJwks(url, { ...options, redirect: 'error' }),
  });
  const organizerRole = config.keycloakOrganizerRole;
  return async (authorization: string | null): Promise<Organizer> => {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (!token) {
      throw new Error('Bearer-Token fehlt.');
    }
    const { alg, kid } = decodeProtectedHeader(token);
    if (typeof kid !== 'string' || !kid || !algorithms.some((algorithm) => algorithm === alg)) {
      throw new Error('Nicht unterstützter Token-Header.');
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms,
      requiredClaims: ['exp', 'sub'],
    });
    if (typeof payload.exp !== 'number' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new Error('Verpflichtende Token-Claims fehlen.');
    }
    if (organizerRole) {
      if (payload['typ'] !== 'Bearer') {
        throw new Error('Keycloak-Access-Token erforderlich.');
      }
      const realmAccess = payload['realm_access'];
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
