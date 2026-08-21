import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  clearCognitoSessionCookies,
  readCognitoRefreshToken,
} from '@/lib/auth/cognito/cookies';
import {
  buildManagedLogoutUrl,
  isSameOriginMutation,
} from '@/lib/auth/cognito/http';
import { revokeRefreshToken } from '@/lib/auth/cognito/oauth';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  if (getAdminDataBackend() !== 'aws') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const config = getCognitoConfig();
  if (!isSameOriginMutation(request, config)) {
    return Response.json(
      { error: 'Cross-origin request rejected' },
      { status: 403, headers: { 'cache-control': 'no-store' } }
    );
  }

  const cookieStore = await cookies();
  const sealedRefreshToken = cookieStore.get(
    COGNITO_COOKIE_NAMES.refreshToken
  )?.value;
  const refreshToken = sealedRefreshToken
    ? await readCognitoRefreshToken(sealedRefreshToken)
    : null;

  if (refreshToken) {
    try {
      await revokeRefreshToken(config, refreshToken);
    } catch {
      // Continue local and managed logout without logging token material.
    }
  }

  const response = NextResponse.json(
    { logoutUrl: buildManagedLogoutUrl(config) },
    { headers: { 'cache-control': 'no-store' } }
  );
  clearCognitoSessionCookies(response);
  return response;
}
