import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  clearCognitoSessionCookies,
  clearCognitoTransientCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import {
  exchangeAuthorizationCode,
  matchesState,
  verifyCognitoSession,
} from '@/lib/auth/cognito/oauth';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

function failedCallback(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/?auth=failed', request.url));
  clearCognitoSessionCookies(response);
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (getAdminDataBackend() !== 'aws') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const code = request.nextUrl.searchParams.get('code');
  const returnedState = request.nextUrl.searchParams.get('state');
  if (!code || !returnedState || request.nextUrl.searchParams.has('error')) {
    return failedCallback(request);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(COGNITO_COOKIE_NAMES.state)?.value;
  const verifier = cookieStore.get(COGNITO_COOKIE_NAMES.verifier)?.value;
  const nonce = cookieStore.get(COGNITO_COOKIE_NAMES.nonce)?.value;
  if (
    !expectedState ||
    !verifier ||
    !nonce ||
    !matchesState(returnedState, expectedState)
  ) {
    return failedCallback(request);
  }

  try {
    const config = getCognitoConfig();
    const tokens = await exchangeAuthorizationCode(config, code, verifier);
    await verifyCognitoSession(config, tokens, nonce);

    const response = NextResponse.redirect(new URL('/', request.url));
    setCognitoSessionCookies(response, tokens);
    clearCognitoTransientCookies(response);
    return response;
  } catch {
    return failedCallback(request);
  }
}
