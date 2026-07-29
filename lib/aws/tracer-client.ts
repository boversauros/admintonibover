import type { AdminDataBackend } from '@/lib/config/adminBackend';

import {
  TRACER_API_VERSION,
  type TracerApiResponse,
  type TracerErrorCode,
  type TracerErrorResponse,
  type TracerSuccessResponse,
} from './tracer-contract';

const POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

type TracerClientOptions = {
  accessToken?: string;
  apiUrl: string;
  backend: AdminDataBackend;
  correlationId: string;
  fetchImplementation?: typeof fetch;
  postId: string;
};

export type TracerClientResult = {
  body: TracerApiResponse;
  correlationId: string;
  status: number;
};

function errorResponse(
  code: TracerErrorCode,
  message: string,
  requestId: string
): TracerErrorResponse {
  return {
    version: TRACER_API_VERSION,
    error: { code, message },
    requestId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSuccessResponse(value: unknown): value is TracerSuccessResponse {
  if (!isRecord(value) || value.version !== TRACER_API_VERSION) return false;
  if (typeof value.requestId !== 'string' || !isRecord(value.data)) {
    return false;
  }
  const migration = value.data.migration;
  return (
    typeof value.data.id === 'string' &&
    typeof value.data.title === 'string' &&
    isRecord(migration) &&
    typeof migration.source === 'string' &&
    typeof migration.status === 'string'
  );
}

function isErrorResponse(value: unknown): value is TracerErrorResponse {
  return (
    isRecord(value) &&
    value.version === TRACER_API_VERSION &&
    typeof value.requestId === 'string' &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  );
}

function errorForStatus(
  status: number,
  requestId: string
): TracerErrorResponse {
  if (status === 400) {
    return errorResponse('BAD_REQUEST', 'Post ID is malformed', requestId);
  }
  if (status === 401) {
    return errorResponse('UNAUTHORIZED', 'Sign in is required', requestId);
  }
  if (status === 403) {
    return errorResponse('FORBIDDEN', 'Access denied', requestId);
  }
  if (status === 404) {
    return errorResponse('NOT_FOUND', 'Post not found', requestId);
  }
  return errorResponse(
    'INTERNAL_ERROR',
    'The post could not be loaded',
    requestId
  );
}

export async function fetchTracerPost({
  accessToken,
  apiUrl,
  backend,
  correlationId,
  fetchImplementation = fetch,
  postId,
}: TracerClientOptions): Promise<TracerClientResult> {
  if (backend !== 'aws') {
    return {
      body: errorForStatus(404, correlationId),
      correlationId,
      status: 404,
    };
  }

  if (!accessToken) {
    return {
      body: errorForStatus(401, correlationId),
      correlationId,
      status: 401,
    };
  }

  if (!POST_ID_PATTERN.test(postId)) {
    return {
      body: errorForStatus(400, correlationId),
      correlationId,
      status: 400,
    };
  }

  let response: Response;
  try {
    response = await fetchImplementation(
      `${apiUrl}/posts/${encodeURIComponent(postId)}`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-correlation-id': correlationId,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      }
    );
  } catch {
    return {
      body: errorForStatus(500, correlationId),
      correlationId,
      status: 500,
    };
  }

  const responseCorrelationId =
    response.headers.get('x-correlation-id') ?? correlationId;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && isSuccessResponse(payload)) {
    return {
      body: payload,
      correlationId: responseCorrelationId,
      status: response.status,
    };
  }

  if (!response.ok && isErrorResponse(payload)) {
    return {
      body: payload,
      correlationId: responseCorrelationId,
      status: response.status,
    };
  }

  const status = [400, 401, 403, 404].includes(response.status)
    ? response.status
    : 500;
  return {
    body: errorForStatus(status, responseCorrelationId),
    correlationId: responseCorrelationId,
    status,
  };
}
