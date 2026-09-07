import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  clearCognitoSessionCookies,
  clearCognitoTransientCookies,
  readCognitoTransientCookie,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { getApplicationOrigin } from '@/lib/auth/cognito/http';
import {
  exchangeAuthorizationCode,
  matchesState,
  verifyCognitoSession,
} from '@/lib/auth/cognito/oauth';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

function failedCallback(
  config: ReturnType<typeof getCognitoConfig>
): NextResponse {
  const response = NextResponse.redirect(
    new URL('/?auth=failed', `${getApplicationOrigin(config)}/`),
    { headers: { 'cache-control': 'no-store' } }
  );
  clearCognitoSessionCookies(response);
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (getAdminDataBackend() !== 'aws') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const config = getCognitoConfig();

  const code = request.nextUrl.searchParams.get('code');
  const returnedState = request.nextUrl.searchParams.get('state');
  if (!code || !returnedState || request.nextUrl.searchParams.has('error')) {
    return failedCallback(config);
  }

  const cookieStore = await cookies();
  const sealedRequest = cookieStore.get(
    COGNITO_COOKIE_NAMES.oauthRequest
  )?.value;
  const oauthRequest = sealedRequest
    ? await readCognitoTransientCookie(sealedRequest)
    : null;
  if (!oauthRequest || !matchesState(returnedState, oauthRequest.state)) {
    return failedCallback(config);
  }

  try {
    const tokens = await exchangeAuthorizationCode(
      config,
      code,
      oauthRequest.verifier
    );
    await verifyCognitoSession(config, tokens, oauthRequest.nonce);

    const response = NextResponse.redirect(
      new URL(oauthRequest.returnTo, `${getApplicationOrigin(config)}/`),
      { headers: { 'cache-control': 'no-store' } }
    );
    await setCognitoSessionCookies(response, tokens);
    clearCognitoTransientCookies(response);
    return response;
  } catch {
    return failedCallback(config);
  }
}
