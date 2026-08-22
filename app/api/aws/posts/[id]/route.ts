import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { fetchTracerPost } from '@/lib/aws/tracer-client';
import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const backend = getAdminDataBackend();
  const suppliedCorrelationId = request.headers.get('x-correlation-id');
  const correlationId =
    suppliedCorrelationId &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(suppliedCorrelationId)
      ? suppliedCorrelationId
      : randomUUID();
  const config = backend === 'aws' ? getCognitoConfig() : null;
  const session = config ? await readCognitoSession(config) : null;
  const { id } = await params;

  const result = await fetchTracerPost({
    accessToken: session?.accessToken,
    apiUrl: config && session ? config.apiUrl : '',
    backend,
    correlationId,
    postId: id,
  });

  const response = NextResponse.json(result.body, {
    status: result.status,
    headers: {
      'cache-control': 'no-store',
      'x-correlation-id': result.correlationId,
    },
  });
  if (backend === 'aws' && !session) {
    clearCognitoSessionCookies(response);
  }
  if (session?.refreshedTokens) {
    await setCognitoSessionCookies(response, session.refreshedTokens);
  }
  return response;
}
