import { NextResponse } from 'next/server';

import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (getAdminDataBackend() !== 'aws') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await readCognitoSession();
  if (!session) {
    const response = NextResponse.json(
      { user: null },
      {
        status: 401,
        headers: { 'cache-control': 'no-store' },
      }
    );
    clearCognitoSessionCookies(response);
    return response;
  }

  const response = NextResponse.json(
    {
      user: session.user,
      expiresAt: session.accessExpiresAt,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
  if (session.refreshedTokens) {
    setCognitoSessionCookies(response, session.refreshedTokens);
  }
  return response;
}
