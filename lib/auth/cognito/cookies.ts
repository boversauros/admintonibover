import type { NextResponse } from 'next/server';

export const COGNITO_COOKIE_NAMES = {
  accessToken: 'admintonibover-cognito-access',
  idToken: 'admintonibover-cognito-id',
  nonce: 'admintonibover-cognito-nonce',
  refreshToken: 'admintonibover-cognito-refresh',
  state: 'admintonibover-cognito-state',
  verifier: 'admintonibover-cognito-verifier',
} as const;

export type CognitoTokenSet = {
  accessToken: string;
  expiresIn: number;
  idToken: string;
  refreshToken?: string;
};

type TransientValues = {
  nonce: string;
  state: string;
  verifier: string;
};

function baseCookieOptions() {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setCognitoTransientCookies(
  response: NextResponse,
  values: TransientValues
): void {
  const options = { ...baseCookieOptions(), maxAge: 10 * 60 };
  response.cookies.set(COGNITO_COOKIE_NAMES.verifier, values.verifier, options);
  response.cookies.set(COGNITO_COOKIE_NAMES.state, values.state, options);
  response.cookies.set(COGNITO_COOKIE_NAMES.nonce, values.nonce, options);
}

export function clearCognitoTransientCookies(response: NextResponse): void {
  const options = { ...baseCookieOptions(), maxAge: 0 };
  response.cookies.set(COGNITO_COOKIE_NAMES.verifier, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.state, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.nonce, '', options);
}

export function setCognitoSessionCookies(
  response: NextResponse,
  tokens: CognitoTokenSet
): void {
  const accessMaxAge = Math.max(60, Math.min(tokens.expiresIn, 15 * 60));
  const accessOptions = { ...baseCookieOptions(), maxAge: accessMaxAge };
  response.cookies.set(
    COGNITO_COOKIE_NAMES.accessToken,
    tokens.accessToken,
    accessOptions
  );
  response.cookies.set(
    COGNITO_COOKIE_NAMES.idToken,
    tokens.idToken,
    accessOptions
  );

  if (tokens.refreshToken) {
    response.cookies.set(
      COGNITO_COOKIE_NAMES.refreshToken,
      tokens.refreshToken,
      { ...baseCookieOptions(), maxAge: 24 * 60 * 60 }
    );
  }
}

export function clearCognitoSessionCookies(response: NextResponse): void {
  const options = { ...baseCookieOptions(), maxAge: 0 };
  response.cookies.set(COGNITO_COOKIE_NAMES.accessToken, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.idToken, '', options);
  response.cookies.set(COGNITO_COOKIE_NAMES.refreshToken, '', options);
  clearCognitoTransientCookies(response);
}
