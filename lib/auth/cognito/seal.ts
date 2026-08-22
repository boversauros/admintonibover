import { EncryptJWT, jwtDecrypt } from 'jose';

export const COGNITO_SESSION_SECRET_ENV = 'AWS_COGNITO_SESSION_SECRET';

const SESSION_AUDIENCE = 'admintonibover-admin';
const SESSION_ISSUER = 'admintonibover-next-session';
const SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type CognitoCookiePurpose =
  | 'access-token'
  | 'identity-token'
  | 'oauth-request'
  | 'refresh-token';

type SealedPayload = {
  purpose: CognitoCookiePurpose;
  value: unknown;
};

export function parseCognitoSessionSecret(
  value: string | undefined
): Uint8Array {
  const normalized = value?.trim();
  if (!normalized || !SESSION_SECRET_PATTERN.test(normalized)) {
    throw new Error(
      `${COGNITO_SESSION_SECRET_ENV} must be an unpadded base64url-encoded 32-byte value`
    );
  }

  const key = Buffer.from(normalized, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== normalized) {
    throw new Error(
      `${COGNITO_SESSION_SECRET_ENV} must be an unpadded base64url-encoded 32-byte value`
    );
  }
  return key;
}

export function getCognitoSessionKey(): Uint8Array {
  return parseCognitoSessionSecret(process.env[COGNITO_SESSION_SECRET_ENV]);
}

export async function sealCognitoCookie(
  purpose: CognitoCookiePurpose,
  value: unknown,
  key: Uint8Array = getCognitoSessionKey(),
  lifetimeSeconds = 24 * 60 * 60,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  return new EncryptJWT({ purpose, value } satisfies SealedPayload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setAudience(SESSION_AUDIENCE)
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + lifetimeSeconds)
    .encrypt(key);
}

export async function unsealCognitoCookie<T>(
  sealed: string,
  purpose: CognitoCookiePurpose,
  key: Uint8Array = getCognitoSessionKey(),
  now = new Date()
): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(sealed, key, {
      audience: SESSION_AUDIENCE,
      issuer: SESSION_ISSUER,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
      currentDate: now,
    });
    if (payload.purpose !== purpose || !('value' in payload)) {
      return null;
    }
    return payload.value as T;
  } catch {
    return null;
  }
}
