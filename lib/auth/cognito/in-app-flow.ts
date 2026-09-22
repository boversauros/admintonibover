import { NextResponse } from 'next/server';

import type { CognitoConfig } from './config';
import {
  clearCognitoTransientCookies,
  clearCognitoSessionCookies,
  readNewPasswordChallengeCookie,
  setCognitoSessionCookies,
  setNewPasswordChallengeCookie,
  type CognitoTokenSet,
} from './cookies';
import { isJsonRequest, isSameOriginMutation, safeReturnTo } from './http';
import { verifyCognitoSession } from './oauth';
import {
  completeNewPasswordChallenge,
  confirmCognitoPasswordReset,
  requestCognitoPasswordReset,
  revokeCognitoRefreshToken,
  signInCognitoUser,
  verifyCognitoTokenActive,
  type CognitoSignInResult,
} from './user-pool';

const HEADERS = { 'cache-control': 'no-store' };
const MAX_BODY_BYTES = 4096;
const AUTH_ERROR =
  'No s’ha pogut iniciar sessió. Comprova les dades i torna-ho a provar.';
const RESET_MESSAGE =
  'Si aquest compte pot recuperar l’accés, s’ha enviat un codi.';

type Fields = Record<string, unknown>;

export type InAppAuthDependencies = {
  signIn: typeof signInCognitoUser;
  completeChallenge: typeof completeNewPasswordChallenge;
  requestReset: typeof requestCognitoPasswordReset;
  confirmReset: typeof confirmCognitoPasswordReset;
  verifyTokens: (
    config: CognitoConfig,
    tokens: CognitoTokenSet
  ) => Promise<void>;
};

const defaultDependencies: InAppAuthDependencies = {
  signIn: signInCognitoUser,
  completeChallenge: completeNewPasswordChallenge,
  requestReset: requestCognitoPasswordReset,
  confirmReset: confirmCognitoPasswordReset,
  async verifyTokens(config, tokens) {
    const verified = await verifyCognitoSession(config, tokens);
    await verifyCognitoTokenActive(
      config,
      tokens.accessToken,
      verified.user.id
    );
  },
};

function json(value: Fields, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: HEADERS });
}

function value(fields: Fields, name: string, maxLength: number): string | null {
  const candidate = fields[name];
  return typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= maxLength
    ? candidate
    : null;
}

export function compliantPassword(password: string): boolean {
  return (
    password.length >= 14 &&
    password.length <= 1024 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function fieldsFrom(
  request: Request,
  config: CognitoConfig
): Promise<Fields | NextResponse> {
  if (!isSameOriginMutation(request, config)) {
    return json({ error: 'Sol·licitud d’un altre origen rebutjada.' }, 403);
  }
  if (!isJsonRequest(request)) {
    return json({ error: 'Cal una sol·licitud JSON.' }, 415);
  }
  if (!request.body) return json({ error: 'Sol·licitud no vàlida.' }, 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return json({ error: 'Sol·licitud no vàlida.' }, 400);
      }
      chunks.push(chunk);
    }
  } catch {
    return json({ error: 'Sol·licitud no vàlida.' }, 400);
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Fields)
      : json({ error: 'Sol·licitud no vàlida.' }, 400);
  } catch {
    return json({ error: 'Sol·licitud no vàlida.' }, 400);
  }
}

async function authenticated(
  config: CognitoConfig,
  tokens: CognitoTokenSet,
  returnTo: string,
  dependencies: InAppAuthDependencies
): Promise<NextResponse> {
  await dependencies.verifyTokens(config, tokens);
  const response = json({
    status: 'authenticated',
    returnTo: safeReturnTo(returnTo, config),
  });
  await setCognitoSessionCookies(response, tokens);
  clearCognitoTransientCookies(response);
  return response;
}

export async function handleInAppSignIn(
  request: Request,
  config: CognitoConfig,
  dependencies = defaultDependencies
): Promise<NextResponse> {
  const fields = await fieldsFrom(request, config);
  if (fields instanceof NextResponse) return fields;
  const email = value(fields, 'email', 320)?.trim();
  const password = value(fields, 'password', 1024);
  if (!email || !password) return json({ error: AUTH_ERROR }, 401);

  try {
    const result: CognitoSignInResult = await dependencies.signIn(
      config,
      email,
      password
    );
    const returnTo =
      typeof fields.returnTo === 'string' ? fields.returnTo : '/';
    if (result.type === 'authenticated') {
      return await authenticated(config, result.tokens, returnTo, dependencies);
    }
    if (result.challengeName !== 'NEW_PASSWORD_REQUIRED') {
      return json({ error: AUTH_ERROR }, 401);
    }
    const response = json({ status: 'new-password-required' });
    await setNewPasswordChallengeCookie(response, {
      username: result.challengeParameters.USER_ID_FOR_SRP || email,
      session: result.session,
      returnTo: safeReturnTo(returnTo, config),
    });
    return response;
  } catch {
    return json({ error: AUTH_ERROR }, 401);
  }
}

export async function handleNewPassword(
  request: Request,
  config: CognitoConfig,
  sealedChallenge: string | undefined,
  dependencies = defaultDependencies
): Promise<NextResponse> {
  const fields = await fieldsFrom(request, config);
  if (fields instanceof NextResponse) return fields;
  const password = value(fields, 'password', 1024);
  const challenge = await readNewPasswordChallengeCookie(sealedChallenge);
  if (!challenge)
    return json(
      { error: 'Torna a iniciar sessió per establir la contrasenya.' },
      401
    );
  if (!password || !compliantPassword(password)) {
    return json(
      { error: 'La contrasenya no compleix els requisits indicats.' },
      400
    );
  }
  try {
    const tokens = await dependencies.completeChallenge(
      config,
      challenge.username,
      challenge.session,
      password
    );
    return await authenticated(
      config,
      tokens,
      challenge.returnTo,
      dependencies
    );
  } catch {
    return json(
      {
        error:
          'No s’ha pogut establir la contrasenya. Torna a iniciar sessió i prova-ho de nou.',
      },
      400
    );
  }
}

export async function handleForgotPassword(
  request: Request,
  config: CognitoConfig,
  dependencies = defaultDependencies
): Promise<NextResponse> {
  const fields = await fieldsFrom(request, config);
  if (fields instanceof NextResponse) return fields;
  const email = value(fields, 'email', 320)?.trim();
  if (!email)
    return json({ error: 'Introdueix una adreça de correu electrònic.' }, 400);
  try {
    await dependencies.requestReset(config, email);
  } catch {
    // Cognito can return different outcomes for unknown users. Never reveal them.
  }
  return json({ message: RESET_MESSAGE });
}

export async function handleConfirmPassword(
  request: Request,
  config: CognitoConfig,
  dependencies = defaultDependencies
): Promise<NextResponse> {
  const fields = await fieldsFrom(request, config);
  if (fields instanceof NextResponse) return fields;
  const email = value(fields, 'email', 320)?.trim();
  const code = value(fields, 'code', 64);
  const password = value(fields, 'password', 1024);
  if (!email || !code || !password)
    return json({ error: 'Omple tots els camps.' }, 400);
  if (!compliantPassword(password)) {
    return json(
      { error: 'La contrasenya no compleix els requisits indicats.' },
      400
    );
  }
  try {
    await dependencies.confirmReset(config, email, code, password);
    return json({ status: 'password-reset' });
  } catch {
    return json(
      {
        error:
          'No s’ha pogut restablir la contrasenya. Comprova el codi i torna-ho a provar.',
      },
      400
    );
  }
}

export async function handleInAppSignOut(
  request: Request,
  config: CognitoConfig,
  refreshToken: string | null,
  revoke = revokeCognitoRefreshToken
): Promise<NextResponse> {
  if (!isSameOriginMutation(request, config)) {
    return json({ error: 'Sol·licitud d’un altre origen rebutjada.' }, 403);
  }
  if (refreshToken) {
    try {
      await revoke(config, refreshToken);
    } catch {
      // Clear local credentials even when the provider is temporarily unavailable.
    }
  }
  const response = json({ status: 'signed-out' });
  clearCognitoSessionCookies(response);
  return response;
}
