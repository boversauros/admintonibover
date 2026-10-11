import { MediaValidationError } from '@/lib/domain/media/errors';
import { validateIdempotencyKey } from '@/lib/domain/media/validation';
import type { Post } from '@/lib/domain/posts/types';

import type { AdminApiEvent, AdminApiResponse } from './context';
import { ApiValidationError, validation } from './errors';

const API_VERSION = 1;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function header(event: AdminApiEvent, name: string): string | undefined {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === expected) return value;
  }
  return undefined;
}

export function correlationId(event: AdminApiEvent): string {
  const supplied = header(event, 'x-correlation-id');
  if (supplied && CORRELATION_ID_PATTERN.test(supplied)) return supplied;
  return event.requestContext?.requestId ?? 'unknown';
}

export function response(
  statusCode: number,
  body: Record<string, unknown>,
  requestId: string,
  headers: Record<string, string> = {}
): AdminApiResponse {
  return {
    statusCode,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'x-correlation-id': requestId,
      ...headers,
    },
    body: JSON.stringify({ version: API_VERSION, ...body, requestId }),
  };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  headers: Record<string, string> = {}
): AdminApiResponse {
  return response(statusCode, { error: { code, message } }, requestId, headers);
}

export function postResponse(
  statusCode: number,
  post: Post,
  requestId: string,
  replayed = false
): AdminApiResponse {
  return response(statusCode, { data: { post, replayed } }, requestId, {
    etag: `"${post.version}"`,
  });
}

export function parseBody(event: AdminApiEvent): unknown {
  const encoded = event.body ?? '';
  const raw = event.isBase64Encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : encoded;
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) {
    throw validation('body', 'BODY_TOO_LARGE', 'Request body exceeds 256 KiB');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw validation('body', 'INVALID_JSON', 'A valid JSON body is required');
  }
}

export function recordBody(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw validation('body', 'INVALID_BODY', 'A JSON object is required');
  }
  return value;
}

export function stringField(
  record: Record<string, unknown>,
  field: string,
  path: string,
  maximum: number,
  allowEmpty = false
): string {
  const value = record[field];
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximum
  ) {
    throw validation(
      path,
      'INVALID_STRING',
      `Must be a string of at most ${maximum} characters`
    );
  }
  return value;
}

export function numberField(
  record: Record<string, unknown>,
  field: string,
  path: string,
  minimum = Number.MIN_SAFE_INTEGER
): number {
  const value = record[field];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw validation(path, 'INVALID_INTEGER', 'Must be a valid integer');
  }
  return value as number;
}

export function booleanField(
  record: Record<string, unknown>,
  field: string,
  path: string
): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw validation(path, 'INVALID_BOOLEAN', 'Must be true or false');
  }
  return value;
}

export function validateId(value: unknown, path = 'id'): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw validation(
      path,
      'INVALID_ID',
      'Must contain only letters, digits, underscores, or hyphens'
    );
  }
  return value;
}

export function pathId(event: AdminApiEvent): string {
  return validateId(event.pathParameters?.id, 'id');
}

export function requireIdempotencyKey(event: AdminApiEvent): string {
  const value = header(event, 'idempotency-key') ?? '';
  try {
    validateIdempotencyKey(value);
  } catch (error) {
    if (error instanceof MediaValidationError) {
      throw new ApiValidationError(error.issues);
    }
    throw error;
  }
  return value;
}

export function expectedVersion(event: AdminApiEvent): number {
  const raw = header(event, 'if-match');
  const normalized = raw?.replace(/^W\//, '').replace(/^"|"$/g, '');
  if (!normalized || !/^[1-9]\d*$/.test(normalized)) {
    throw validation(
      'if-match',
      'INVALID_VERSION',
      'If-Match must contain the current positive integer version'
    );
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw validation('if-match', 'INVALID_VERSION', 'Version is too large');
  }
  return value;
}
