import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

import { AdminApiClient, type AdminApiClientResult } from './admin-api-client';
import { ADMIN_API_VERSION } from './admin-read-contract';

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

type AdminReadOperation<T> = (
  client: AdminApiClient
) => Promise<AdminApiClientResult<T>>;

function requestCorrelationId(request: NextRequest): string {
  const supplied = request.headers.get('x-correlation-id');
  return supplied && CORRELATION_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

function localError(
  status: number,
  code: string,
  message: string,
  requestId: string
): NextResponse {
  return NextResponse.json(
    {
      version: ADMIN_API_VERSION,
      error: { code, message },
      requestId,
    },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-correlation-id': requestId,
      },
    }
  );
}

export async function handleAwsAdminRead<T>(
  request: NextRequest,
  operation: AdminReadOperation<T>
): Promise<Response> {
  const requestId = requestCorrelationId(request);
  if (getAdminDataBackend() !== 'aws') {
    return localError(404, 'NOT_FOUND', 'Route not found', requestId);
  }

  const config = getCognitoConfig();
  const session = await readCognitoSession(config);
  if (!session) {
    const response = localError(
      401,
      'UNAUTHORIZED',
      'Sign-in required',
      requestId
    );
    clearCognitoSessionCookies(response);
    return response;
  }

  const result = await operation(
    new AdminApiClient({
      accessToken: session.accessToken,
      apiUrl: config.apiUrl,
      correlationId: requestId,
    })
  );
  const response = NextResponse.json(result.envelope, {
    status: result.status,
    headers: {
      'cache-control': 'no-store',
      'x-correlation-id': result.correlationId,
      ...(result.ok && result.etag ? { etag: result.etag } : {}),
      ...(!result.ok && result.retryAfter
        ? { 'retry-after': result.retryAfter }
        : {}),
    },
  });

  if (!result.ok && result.status === 401) {
    clearCognitoSessionCookies(response);
  } else if (session.refreshedTokens) {
    await setCognitoSessionCookies(response, session.refreshedTokens);
  }
  return response;
}
