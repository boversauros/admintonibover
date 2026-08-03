import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  clearCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { revokeRefreshToken } from '@/lib/auth/cognito/oauth';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  if (getAdminDataBackend() !== 'aws') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const config = getCognitoConfig();
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(
    COGNITO_COOKIE_NAMES.refreshToken
  )?.value;

  if (refreshToken) {
    try {
      await revokeRefreshToken(config, refreshToken);
    } catch {
      // Local cookies are still cleared; the one-day token expires naturally.
    }
  }

  const managedLogout = new URL('/logout', `${config.loginUrl}/`);
  managedLogout.search = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUrl,
  }).toString();

  const response = NextResponse.redirect(managedLogout);
  clearCognitoSessionCookies(response);
  return response;
}
