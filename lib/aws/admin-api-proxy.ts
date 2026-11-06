import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { ADMIN_API_VERSION } from '@/lib/api/adminContract';
import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { isCorrelationId } from '@/lib/contract/correlation';
import {
  clearCognitoSessionCookies,
  setCognitoSessionCookies,
} from '@/lib/auth/cognito/cookies';
import { isJsonRequest, isSameOriginMutation } from '@/lib/auth/cognito/http';
import { readCognitoSession } from '@/lib/auth/cognito/session';
import {
  SITE_REBUILD_HEADER,
  siteRebuildForMutation,
  type SiteRebuildPolicy,
} from '@/lib/site-rebuild';

export const MAX_PROXY_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;

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
  return supplied && isCorrelationId(supplied) ? supplied : randomUUID();
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string
): NextResponse {
  return NextResponse.json(
    { version: ADMIN_API_VERSION, error: { code, message }, requestId },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-correlation-id': requestId,
      },
    }
  );
}

export type AdminApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const FORWARDED_RESPONSE_HEADERS = [
  'content-disposition',
  'etag',
  'retry-after',
] as const;

/**
 * Sends one request to the AWS admin API and returns its answer unchanged.
 * The Lambda validates input and the browser validates output, so nothing is
 * parsed here. Reads forward the caller's query string as is.
 */
export async function forwardToAdminApi({
  accessToken,
  apiUrl,
  body,
  fetchImplementation = fetch,
  method,
  path,
  request,
  requestId,
  siteRebuild,
}: {
  accessToken: string;
  apiUrl: string;
  body?: string;
  fetchImplementation?: typeof fetch;
  method: AdminApiMethod;
  path: string;
  request: NextRequest;
  requestId: string;
  siteRebuild?: SiteRebuildPolicy;
}): Promise<NextResponse> {
  const url = new URL(apiUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  if (method === 'GET') url.search = request.nextUrl.search;
  const idempotencyKey = request.headers.get('idempotency-key');
  const expectedVersion = request.headers.get('if-match');

  let upstream: Response;
  let responseBody: string;
  try {
    upstream = await fetchImplementation(url, {
      method,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'x-correlation-id': requestId,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        ...(expectedVersion ? { 'if-match': expectedVersion } : {}),
      },
    });
    responseBody = await upstream.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return jsonError(
        504,
        'UPSTREAM_TIMEOUT',
        'The AWS admin API timed out',
        requestId
      );
    }
    return jsonError(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The AWS admin API is unavailable',
      requestId
    );
  }

  // The AWS write has committed; the hook outcome is reported beside it.
  const rebuild = await siteRebuildForMutation(
    siteRebuild,
    { ok: upstream.ok, body: responseBody },
    `${method} ${path}`
  );
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'x-correlation-id': upstream.headers.get('x-correlation-id') ?? requestId,
  });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (rebuild) headers.set(SITE_REBUILD_HEADER, rebuild);
  return new NextResponse(responseBody, { status: upstream.status, headers });
}

/**
 * The one way the browser reaches the AWS admin API: checks the same-origin
 * and body rules, attaches the signed-in user's token, and forwards.
 */
export async function proxyAwsAdminApi(
  request: NextRequest,
  path: string,
  method: AdminApiMethod,
  { siteRebuild }: { siteRebuild?: SiteRebuildPolicy } = {}
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

  const response = await forwardToAdminApi({
    accessToken: session.accessToken,
    apiUrl: config.apiUrl,
    body,
    method,
    path,
    request,
    requestId,
    siteRebuild,
  });
  if (response.status === 401) {
    clearCognitoSessionCookies(response);
  } else if (session.refreshedTokens) {
    await setCognitoSessionCookies(response, session.refreshedTokens);
  }
  return response;
}
