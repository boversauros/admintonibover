import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { isSameOriginMutation } from '@/lib/auth/cognito/http';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import { SITE_REBUILD_HEADER, triggerSiteRebuild } from '@/lib/site-rebuild';

export const dynamic = 'force-dynamic';

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    { version: 1, ...body },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

/** Manual retry for a failed site rebuild; any signed-in admin may use it. */
export async function POST(request: NextRequest): Promise<Response> {
  const config = getCognitoConfig();
  if (!isSameOriginMutation(request, config)) {
    return json(403, {
      error: {
        code: 'CSRF_REJECTED',
        message: 'Cross-origin request rejected',
      },
    });
  }
  const session = await readCognitoSession(config);
  if (!session) {
    const response = json(401, {
      error: { code: 'UNAUTHORIZED', message: 'Sign-in required' },
    });
    clearCognitoSessionCookies(response);
    return response;
  }

  const status = await triggerSiteRebuild('manual retry');
  const response = json(status === 'failed' ? 502 : 200, {
    data: { status },
  });
  response.headers.set(SITE_REBUILD_HEADER, status);
  if (session.refreshedTokens) {
    await setCognitoSessionCookies(response, session.refreshedTokens);
  }
  return response;
}
