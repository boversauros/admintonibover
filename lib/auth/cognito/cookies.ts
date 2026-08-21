import type { NextResponse } from 'next/server';

import { sealCognitoCookie, unsealCognitoCookie } from './seal';

export const COGNITO_COOKIE_NAMES = {
  accessToken: 'admintonibover-cognito-access',
  idToken: 'admintonibover-cognito-id',
  oauthRequest: 'admintonibover-cognito-oauth',
  refreshToken: 'admintonibover-cognito-refresh',
} as const;

export type CognitoTokenSet = {
  accessToken: string;
  expiresIn: number;
  idToken: string;
  refreshToken?: string;
};

export type CognitoTransientValues = {
  nonce: string;
  returnTo: string;
  state: string;
  verifier: string;
};

const TRANSIENT_MAX_AGE_SECONDS = 10 * 60;
const SESSION_ENVELOPE_MAX_AGE_SECONDS = 24 * 60 * 60;

export function cognitoCookieOptions(
  secure = process.env.NODE_ENV === 'production'
) {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure,
  };
}

export async function setCognitoTransientCookies(
  response: NextResponse,
  values: CognitoTransientValues
): Promise<void> {
  const sealed = await sealCognitoCookie(
    'oauth-request',
    values,
    undefined,
    TRANSIENT_MAX_AGE_SECONDS
  );
  response.cookies.set(COGNITO_COOKIE_NAMES.oauthRequest, sealed, {
    ...cognitoCookieOptions(),
    maxAge: TRANSIENT_MAX_AGE_SECONDS,
  });
}

function isTransientValues(value: unknown): value is CognitoTransientValues {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CognitoTransientValues>;
  return (
    typeof candidate.nonce === 'string' &&
    typeof candidate.returnTo === 'string' &&
    typeof candidate.state === 'string' &&
    typeof candidate.verifier === 'string'
  );
}

export async function readCognitoTransientCookie(
  sealed: string
): Promise<CognitoTransientValues | null> {
  const value = await unsealCognitoCookie<unknown>(sealed, 'oauth-request');
  return isTransientValues(value) ? value : null;
}

export function clearCognitoTransientCookies(response: NextResponse): void {
  const options = { ...cognitoCookieOptions(), maxAge: 0 };
  response.cookies.set(COGNITO_COOKIE_NAMES.oauthRequest, '', options);
}

export async function setCognitoSessionCookies(
  response: NextResponse,
  tokens: CognitoTokenSet
): Promise<void> {
  const accessMaxAge = Math.max(1, Math.min(tokens.expiresIn, 15 * 60));
  const accessOptions = { ...cognitoCookieOptions(), maxAge: accessMaxAge };
  const [accessToken, idToken] = await Promise.all([
    sealCognitoCookie(
      'access-token',
      tokens.accessToken,
      undefined,
      SESSION_ENVELOPE_MAX_AGE_SECONDS
    ),
    sealCognitoCookie(
      'identity-token',
      tokens.idToken,
      undefined,
      SESSION_ENVELOPE_MAX_AGE_SECONDS
    ),
  ]);
  response.cookies.set(
    COGNITO_COOKIE_NAMES.accessToken,
    accessToken,
    accessOptions
  );
  response.cookies.set(COGNITO_COOKIE_NAMES.idToken, idToken, accessOptions);

  if (tokens.refreshToken) {
    const refreshToken = await sealCognitoCookie(
      'refresh-token',
      tokens.refreshToken,
      undefined,
      SESSION_ENVELOPE_MAX_AGE_SECONDS
    );
    response.cookies.set(COGNITO_COOKIE_NAMES.refreshToken, refreshToken, {
      ...cognitoCookieOptions(),
      maxAge: 24 * 60 * 60,
    });
  }
}

async function readTokenCookie(
  sealed: string | undefined,
  purpose: 'access-token' | 'identity-token' | 'refresh-token'
): Promise<string | null> {
  if (!sealed) return null;
  const value = await unsealCognitoCookie<unknown>(sealed, purpose);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readCognitoAccessToken(
  sealed: string | undefined
): Promise<string | null> {
  return readTokenCookie(sealed, 'access-token');
}

export function readCognitoIdToken(
  sealed: string | undefined
): Promise<string | null> {
  return readTokenCookie(sealed, 'identity-token');
}

export function readCognitoRefreshToken(
  sealed: string | undefined
): Promise<string | null> {
  return readTokenCookie(sealed, 'refresh-token');
}

export function clearCognitoSessionCookies(response: NextResponse): void {
  const options = { ...cognitoCookieOptions(), maxAge: 0 };
  response.cookies.set(COGNITO_COOKIE_NAMES.accessToken, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.idToken, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.refreshToken, '', options);
  clearCognitoTransientCookies(response);
}
