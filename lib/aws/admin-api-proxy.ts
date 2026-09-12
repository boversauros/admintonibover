import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { isJsonRequest, isSameOriginMutation } from '@/lib/auth/cognito/http';
import { readCognitoSession } from '@/lib/auth/cognito/session';

export const MAX_PROXY_BODY_BYTES = 256 * 1024;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

class RequestBodyTooLargeError extends Error {}

function declaredBodyTooLarge(request: NextRequest): boolean {
  const value = request.headers.get('content-length');
  return (
    value !== null &&
    /^\d+$/.test(value) &&
    Number(value) > MAX_PROXY_BODY_BYTES
  );
}

export async function readBoundedRequestBody(
  request: NextRequest
): Promise<string> {
  if (declaredBodyTooLarge(request)) throw new RequestBodyTooLargeError();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROXY_BODY_BYTES) {
        throw new RequestBodyTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
): Promise<Response> {
  const requestId = correlationId(request);
  const isMutation = method !== 'GET';
  const hasJsonBody = method === 'POST' || method === 'PUT';
  const config = getCognitoConfig();
  if (isMutation && !isSameOriginMutation(request, config)) {
    return jsonError(
      403,
      'CSRF_REJECTED',
      'Cross-origin request rejected',
      requestId
    );
  }
  if (hasJsonBody && !isJsonRequest(request)) {
    return jsonError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json',
      requestId
    );
  }
  if (hasJsonBody && declaredBodyTooLarge(request)) {
    return jsonError(
      413,
      'BODY_TOO_LARGE',
      'Request body exceeds 256 KiB',
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
  if (hasJsonBody) {
    try {
      body = await readBoundedRequestBody(request);
    } catch (error) {
      if (!(error instanceof RequestBodyTooLargeError)) {
        return jsonError(
          400,
          'INVALID_BODY',
          'Request body could not be read',
          requestId
        );
      }
      return jsonError(
        413,
        'BODY_TOO_LARGE',
        'Request body exceeds 256 KiB',
        requestId
      );
    }
  }

  try {
    const apiUrl = new URL(config.apiUrl);
    apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const idempotencyKey = request.headers.get('idempotency-key');
    const expectedVersion = request.headers.get('if-match');
    const upstream = await fetch(apiUrl, {
      method,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.accessToken}`,
        'x-correlation-id': requestId,
        ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        ...(expectedVersion ? { 'if-match': expectedVersion } : {}),
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
        ...(upstream.headers.get('etag')
          ? { etag: upstream.headers.get('etag') ?? '' }
          : {}),
        ...(upstream.headers.get('retry-after')
          ? { 'retry-after': upstream.headers.get('retry-after') ?? '' }
          : {}),
        ...(upstream.headers.get('content-disposition')
          ? {
              'content-disposition':
                upstream.headers.get('content-disposition') ?? '',
            }
          : {}),
      },
    });
    if (upstream.status === 401) {
      clearCognitoSessionCookies(response);
    } else if (session.refreshedTokens) {
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
