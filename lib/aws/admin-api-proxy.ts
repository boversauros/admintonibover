import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { isJsonRequest, isSameOriginMutation } from '@/lib/auth/cognito/http';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

const MAX_PROXY_BODY_BYTES = 16 * 1024;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function correlationId(request: NextRequest): string {
  const supplied = request.headers.get('x-correlation-id');
  return supplied && CORRELATION_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string
): NextResponse {
  return NextResponse.json(
    { version: 1, error: { code, message }, requestId },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-correlation-id': requestId,
      },
    }
  );
}

export async function proxyAwsAdminApi(
  request: NextRequest,
  path: string,
  method: 'GET' | 'POST'
): Promise<Response> {
  const requestId = correlationId(request);
  if (getAdminDataBackend() !== 'aws') {
    return jsonError(404, 'NOT_FOUND', 'Route not found', requestId);
  }
  const config = getCognitoConfig();
  if (method === 'POST' && !isSameOriginMutation(request, config)) {
    return jsonError(
      403,
      'CSRF_REJECTED',
      'Cross-origin request rejected',
      requestId
    );
  }
  if (method === 'POST' && !isJsonRequest(request)) {
    return jsonError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json',
      requestId
    );
  }

  const session = await readCognitoSession(config);
  if (!session) {
    const response = jsonError(
      401,
      'UNAUTHORIZED',
      'Sign-in required',
      requestId
    );
    clearCognitoSessionCookies(response);
    return response;
  }

  let body: string | undefined;
  if (method === 'POST') {
    body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_PROXY_BODY_BYTES) {
      return jsonError(
        413,
        'BODY_TOO_LARGE',
        'Request body exceeds 16 KiB',
        requestId
      );
    }
  }

  try {
    const apiUrl = new URL(config.apiUrl);
    apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const idempotencyKey = request.headers.get('idempotency-key');
    const upstream = await fetch(apiUrl, {
      method,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.accessToken}`,
        'x-correlation-id': requestId,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
    });
    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
        'x-correlation-id':
          upstream.headers.get('x-correlation-id') ?? requestId,
      },
    });
    if (session.refreshedTokens) {
      await setCognitoSessionCookies(response, session.refreshedTokens);
    }
    return response;
  } catch {
    return jsonError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The AWS admin API is unavailable',
      requestId
    );
  }
}
