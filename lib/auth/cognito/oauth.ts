import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose';

import type { CognitoConfig } from './config';
import type { CognitoTokenSet } from './cookies';

export type CognitoUser = {
  email: string;
  id: string;
};

export type VerifiedCognitoSession = {
  accessExpiresAt: number;
  user: CognitoUser;
};

export type PkceArtifacts = {
  authorizeUrl: string;
  nonce: string;
  state: string;
  verifier: string;
};

type CognitoTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
};

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

export function createPkceArtifacts(config: CognitoConfig): PkceArtifacts {
  const verifier = toBase64Url(randomBytes(64));
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest());
  const state = toBase64Url(randomBytes(32));
  const nonce = toBase64Url(randomBytes(32));
  const authorizeUrl = new URL('/oauth2/authorize', `${config.loginUrl}/`);

  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: `openid email profile ${config.requiredScope}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    prompt: 'login',
  }).toString();

  return {
    authorizeUrl: authorizeUrl.toString(),
    nonce,
    state,
    verifier,
  };
}

export function matchesState(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function parseTokenResponse(value: CognitoTokenResponse): CognitoTokenSet {
  if (
    typeof value.access_token !== 'string' ||
    typeof value.id_token !== 'string' ||
    typeof value.expires_in !== 'number' ||
    value.token_type !== 'Bearer'
  ) {
    throw new Error('Cognito returned an invalid token response');
  }

  return {
    accessToken: value.access_token,
    expiresIn: value.expires_in,
    idToken: value.id_token,
    refreshToken:
      typeof value.refresh_token === 'string' ? value.refresh_token : undefined,
  };
}

async function requestTokens(
  config: CognitoConfig,
  body: URLSearchParams,
  fetchImplementation: typeof fetch = fetch
): Promise<CognitoTokenSet> {
  const response = await fetchImplementation(
    new URL('/oauth2/token', `${config.loginUrl}/`),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Cognito token request failed with HTTP ${response.status}`
    );
  }

  return parseTokenResponse((await response.json()) as CognitoTokenResponse);
}

export function exchangeAuthorizationCode(
  config: CognitoConfig,
  code: string,
  verifier: string,
  fetchImplementation: typeof fetch = fetch
): Promise<CognitoTokenSet> {
  return requestTokens(
    config,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: config.callbackUrl,
    }),
    fetchImplementation
  );
}

export function refreshCognitoTokens(
  config: CognitoConfig,
  refreshToken: string,
  fetchImplementation: typeof fetch = fetch
): Promise<CognitoTokenSet> {
  return requestTokens(
    config,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
    fetchImplementation
  );
}

export async function revokeRefreshToken(
  config: CognitoConfig,
  refreshToken: string,
  fetchImplementation: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImplementation(
    new URL('/oauth2/revoke', `${config.loginUrl}/`),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        token: refreshToken,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Cognito revoke request failed with HTTP ${response.status}`
    );
  }
}

function requireStringClaim(payload: JWTPayload, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Cognito token is missing ${claim}`);
  }
  return value;
}

function claimContains(value: unknown, required: string): boolean {
  return String(value ?? '')
    .split(' ')
    .includes(required);
}

export async function verifyCognitoSession(
  config: CognitoConfig,
  tokens: Pick<CognitoTokenSet, 'accessToken' | 'idToken'>,
  expectedNonce?: string
): Promise<VerifiedCognitoSession> {
  const jwks = createRemoteJWKSet(
    new URL(`${config.issuer}/.well-known/jwks.json`)
  );
  const [accessResult, idResult] = await Promise.all([
    jwtVerify(tokens.accessToken, jwks, {
      algorithms: ['RS256'],
      issuer: config.issuer,
    }),
    jwtVerify(tokens.idToken, jwks, {
      algorithms: ['RS256'],
      audience: config.clientId,
      issuer: config.issuer,
    }),
  ]);

  return validateCognitoClaims(
    config,
    accessResult.payload,
    idResult.payload,
    expectedNonce
  );
}

export function validateCognitoClaims(
  config: CognitoConfig,
  access: JWTPayload,
  identity: JWTPayload,
  expectedNonce?: string
): VerifiedCognitoSession {
  if (
    access.token_use !== 'access' ||
    access.client_id !== config.clientId ||
    !claimContains(access.scope, config.requiredScope)
  ) {
    throw new Error('Cognito access token claims are invalid');
  }
  if (identity.token_use !== 'id') {
    throw new Error('Cognito ID token claims are invalid');
  }
  if (expectedNonce && identity.nonce !== expectedNonce) {
    throw new Error('Cognito ID token nonce is invalid');
  }
  if (identity.email_verified !== true) {
    throw new Error('Cognito administrator email is not verified');
  }

  const accessExpiresAt = access.exp;
  if (typeof accessExpiresAt !== 'number') {
    throw new Error('Cognito access token is missing exp');
  }

  return {
    accessExpiresAt,
    user: {
      id: requireStringClaim(identity, 'sub'),
      email: requireStringClaim(identity, 'email'),
    },
  };
}

export function accessTokenNeedsRefresh(
  accessToken: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  try {
    const payload = decodeJwt(accessToken);
    return typeof payload.exp !== 'number' || payload.exp <= nowSeconds + 30;
  } catch {
    return false;
  }
}
