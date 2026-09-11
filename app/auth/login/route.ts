import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { setCognitoTransientCookies } from '@/lib/auth/cognito/cookies';
import { createPkceArtifacts } from '@/lib/auth/cognito/oauth';
import { safeReturnTo } from '@/lib/auth/cognito/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const config = getCognitoConfig();
  const artifacts = createPkceArtifacts(config);
  const response = NextResponse.redirect(artifacts.authorizeUrl, {
    headers: { 'cache-control': 'no-store' },
  });
  await setCognitoTransientCookies(response, {
    ...artifacts,
    returnTo: safeReturnTo(
      request.nextUrl.searchParams.get('returnTo'),
      config
    ),
  });
  return response;
}
