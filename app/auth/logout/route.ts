import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  readCognitoRefreshToken,
} from '@/lib/auth/cognito/cookies';
import { handleInAppSignOut } from '@/lib/auth/cognito/in-app-flow';
import { isSameOriginMutation } from '@/lib/auth/cognito/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const config = getCognitoConfig();
  if (!isSameOriginMutation(request, config)) {
    return Response.json(
      { error: 'Sol·licitud d’un altre origen rebutjada.' },
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

  return handleInAppSignOut(request, config, refreshToken);
}
