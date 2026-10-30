import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose';

import type { CognitoConfig } from './config';
import type { CognitoTokenSet } from './cookies';
import { parseCognitoGroups, type CognitoGroup } from './groups';

export type CognitoUser = {
  email: string;
  groups: CognitoGroup[];
  id: string;
};

export type VerifiedCognitoSession = {
  accessExpiresAt: number;
  user: CognitoUser;
};

function requireStringClaim(payload: JWTPayload, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Cognito token is missing ${claim}`);
  }
  return value;
}

function audienceContains(value: unknown, required: string): boolean {
  return Array.isArray(value)
    ? value.some(audience => audience === required)
    : value === required;
}

export async function verifyCognitoSession(
  config: CognitoConfig,
  tokens: Pick<CognitoTokenSet, 'accessToken' | 'idToken'>
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

  return validateCognitoClaims(config, accessResult.payload, idResult.payload);
}

export function validateCognitoClaims(
  config: CognitoConfig,
  access: JWTPayload,
  identity: JWTPayload
): VerifiedCognitoSession {
  if (
    access.iss !== config.issuer ||
    access.token_use !== 'access' ||
    access.client_id !== config.clientId
  ) {
    throw new Error('Cognito access token claims are invalid');
  }
  if (
    identity.iss !== config.issuer ||
    !audienceContains(identity.aud, config.clientId) ||
    identity.token_use !== 'id'
  ) {
    throw new Error('Cognito ID token claims are invalid');
  }
  if (identity.email_verified !== true) {
    throw new Error('Cognito administrator email is not verified');
  }

  const accessSubject = requireStringClaim(access, 'sub');
  const identitySubject = requireStringClaim(identity, 'sub');
  if (accessSubject !== identitySubject) {
    throw new Error('Cognito token subjects do not match');
  }

  const accessExpiresAt = access.exp;
  if (typeof accessExpiresAt !== 'number') {
    throw new Error('Cognito access token is missing exp');
  }

  return {
    accessExpiresAt,
    user: {
      id: identitySubject,
      email: requireStringClaim(identity, 'email'),
      groups: parseCognitoGroups(access['cognito:groups']),
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
