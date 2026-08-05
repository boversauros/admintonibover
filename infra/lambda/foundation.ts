import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

import {
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadIntegrityError,
  MediaUploadNotFoundError,
  MediaValidationError,
} from '@/lib/domain/media/errors';
import {
  validateIdempotencyKey,
  validateImageText,
  validateUploadDescriptor,
} from '@/lib/domain/media/validation';
import {
  PostNotFoundError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';
import { AwsDynamoDbPort } from '@/lib/aws/dynamodb/aws-port';
import { DynamoDbMediaIntentRepository } from '@/lib/aws/dynamodb/media-intent-repository';
import { DynamoDbPostRepository } from '@/lib/aws/dynamodb/post-repository';
import { AwsS3MediaObjectStore } from '@/lib/aws/media/aws-s3-object-store';
import { MediaService } from '@/lib/aws/media/service';

type ApiEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  routeKey?: string;
};

type ApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const API_VERSION = 1;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const UPLOAD_ID_PATTERN = /^[a-f0-9]{64}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

const dynamodb = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamodb, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment setting: ${name}`);
  return value;
}

function header(event: ApiEvent, name: string): string | undefined {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === expected) return value;
  }
  return undefined;
}

function claimContains(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.includes(expected);
  return String(value ?? '')
    .split(' ')
    .includes(expected);
}

function requestId(event: ApiEvent): string {
  const supplied = header(event, 'x-correlation-id');
  if (supplied && CORRELATION_ID_PATTERN.test(supplied)) return supplied;
  return event.requestContext?.requestId ?? 'unknown';
}

function response(
  statusCode: number,
  body: Record<string, unknown>,
  correlationId: string
): ApiResponse {
  return {
    statusCode,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      version: API_VERSION,
      ...body,
      requestId: correlationId,
    }),
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  correlationId: string
): ApiResponse {
  return response(statusCode, { error: { code, message } }, correlationId);
}

function parseBody(event: ApiEvent): unknown {
  const encoded = event.body ?? '';
  const raw = event.isBase64Encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : encoded;
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) {
    throw new MediaValidationError([
      {
        path: 'body',
        code: 'BODY_TOO_LARGE',
        message: 'Request body exceeds 16 KiB',
      },
    ]);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new MediaValidationError([
      {
        path: 'body',
        code: 'INVALID_JSON',
        message: 'A valid JSON body is required',
      },
    ]);
  }
}

function parseConfirmBody(value: unknown): {
  uploadId: string;
  title: string;
  alt: string;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MediaValidationError([
      {
        path: 'body',
        code: 'INVALID_BODY',
        message: 'A JSON object is required',
      },
    ]);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.uploadId !== 'string' ||
    !UPLOAD_ID_PATTERN.test(record.uploadId)
  ) {
    throw new MediaValidationError([
      {
        path: 'uploadId',
        code: 'INVALID_UPLOAD_ID',
        message: 'A valid upload ID is required',
      },
    ]);
  }
  return {
    uploadId: record.uploadId,
    title: validateImageText(record.title, 'title'),
    alt: validateImageText(record.alt, 'alt'),
  };
}

function validatePostId(value: string | undefined): string {
  if (!value || !POST_ID_PATTERN.test(value)) {
    throw new MediaValidationError([
      {
        path: 'postId',
        code: 'INVALID_POST_ID',
        message: 'Post ID is malformed',
      },
    ]);
  }
  return value;
}

function requireIdempotencyKey(event: ApiEvent): string {
  const value = header(event, 'idempotency-key') ?? '';
  validateIdempotencyKey(value);
  return value;
}

function authorized(event: ApiEvent): boolean {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  const clientId = claims.client_id ?? claims.aud;
  return (
    claims.iss === environment('EXPECTED_ISSUER') &&
    clientId === environment('EXPECTED_CLIENT_ID') &&
    claims.token_use === 'access' &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    claimContains(claims.scope, environment('REQUIRED_ADMIN_SCOPE'))
  );
}

function mediaService(correlationId: string): MediaService {
  const tableName = environment('CONTENT_TABLE_NAME');
  const bucketName = environment('CONTENT_BUCKET_NAME');
  const port = new AwsDynamoDbPort(tableName, documentClient);
  const posts = new DynamoDbPostRepository(port);
  const intents = new DynamoDbMediaIntentRepository(port, posts);
  const objects = new AwsS3MediaObjectStore(bucketName, s3);
  return new MediaService(posts, intents, objects, undefined, {
    info: event => console.info(JSON.stringify({ ...event, correlationId })),
    warn: event => console.warn(JSON.stringify({ ...event, correlationId })),
  });
}

function readString(attribute: unknown): string | null {
  if (typeof attribute !== 'object' || attribute === null) return null;
  const value = (attribute as { S?: unknown }).S;
  return typeof value === 'string' ? value : null;
}

function readMap(attribute: unknown): Record<string, unknown> | null {
  if (typeof attribute !== 'object' || attribute === null) return null;
  const value = (attribute as { M?: unknown }).M;
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

async function tracerPost(
  postId: string
): Promise<Record<string, unknown> | null> {
  const key = `POST#${postId}`;
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: environment('CONTENT_TABLE_NAME'),
      Key: { PK: { S: key }, SK: { S: key } },
      ConsistentRead: true,
    })
  );
  if (!result.Item) return null;
  const translations = readMap(result.Item.translations);
  const catalan = readMap(translations?.ca);
  const english = readMap(translations?.en);
  const migration = readMap(result.Item.migration);
  const id = readString(result.Item.id);
  const title = readString(catalan?.title) ?? readString(english?.title);
  const source = readString(migration?.source);
  const status = readString(migration?.status);
  if (!id || !title || !source || !status) {
    throw new Error('DynamoDB post does not match the tracer contract');
  }
  return { id, title, migration: { source, status } };
}

function mappedError(error: unknown, correlationId: string): ApiResponse {
  if (error instanceof MediaValidationError) {
    const bodyTooLarge = error.issues.some(
      issue =>
        issue.code === 'BODY_TOO_LARGE' || issue.code === 'INVALID_IMAGE_SIZE'
    );
    return errorResponse(
      bodyTooLarge ? 413 : 400,
      error.issues[0]?.code ?? error.code,
      error.issues[0]?.message ?? error.message,
      correlationId
    );
  }
  if (error instanceof PostNotFoundError) {
    return errorResponse(404, 'NOT_FOUND', 'Post not found', correlationId);
  }
  if (
    error instanceof PostVersionConflictError ||
    error instanceof MediaUploadConflictError
  ) {
    return errorResponse(
      409,
      error.code,
      'The image upload conflicts with newer state',
      correlationId
    );
  }
  if (error instanceof MediaUploadNotFoundError) {
    return errorResponse(404, error.code, error.message, correlationId);
  }
  if (error instanceof MediaUploadExpiredError) {
    return errorResponse(410, error.code, error.message, correlationId);
  }
  if (error instanceof MediaUploadIntegrityError) {
    return errorResponse(400, error.code, error.message, correlationId);
  }
  console.error(
    JSON.stringify({
      message: 'foundation_request_failed',
      correlationId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
  );
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'The request could not be completed',
    correlationId
  );
}

export async function handler(event: ApiEvent): Promise<ApiResponse> {
  const correlationId = requestId(event);
  try {
    if (!authorized(event)) {
      console.warn(
        JSON.stringify({
          message: 'authorization_claims_rejected',
          correlationId,
        })
      );
      return errorResponse(403, 'FORBIDDEN', 'Access denied', correlationId);
    }

    const routeKey = event.routeKey ?? '';
    if (routeKey === 'GET /health') {
      return response(200, { data: { status: 'ok' } }, correlationId);
    }
    const postId = validatePostId(event.pathParameters?.id);
    if (routeKey === 'GET /posts/{id}') {
      const post = await tracerPost(postId);
      return post
        ? response(200, { data: post }, correlationId)
        : errorResponse(404, 'NOT_FOUND', 'Post not found', correlationId);
    }

    const media = mediaService(correlationId);
    if (routeKey === 'GET /posts/{id}/images') {
      const inspection = await media.inspect(postId);
      return response(200, { data: inspection }, correlationId);
    }
    if (routeKey === 'POST /posts/{id}/images/presign') {
      const descriptor = validateUploadDescriptor(parseBody(event));
      const upload = await media.createUpload(
        postId,
        descriptor,
        requireIdempotencyKey(event)
      );
      return response(201, { data: upload }, correlationId);
    }
    if (routeKey === 'POST /posts/{id}/images/confirm') {
      const body = parseConfirmBody(parseBody(event));
      const confirmed = await media.confirmUpload({
        postId,
        ...body,
        idempotencyKey: requireIdempotencyKey(event),
      });
      return response(200, { data: confirmed }, correlationId);
    }
    return errorResponse(404, 'NOT_FOUND', 'Route not found', correlationId);
  } catch (error) {
    return mappedError(error, correlationId);
  }
}
