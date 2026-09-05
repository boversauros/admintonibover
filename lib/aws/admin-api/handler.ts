import { createHash } from 'node:crypto';

import {
  IMAGE_INVENTORY_STATUSES,
  type ConfirmedImageUpload,
  type ImageInventoryStatus,
  type ImageRole,
  type MediaInspection,
  type PresignedImageUpload,
} from '@/lib/domain/media/contracts';
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
  PostAggregateTooLargeError,
  PostDataIntegrityError,
  PostNotFoundError,
  PostSlugConflictError,
  PostValidationError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';
import type { PostRepository } from '@/lib/domain/posts/repository';
import type {
  Post,
  PostImage,
  PostKeyword,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';
import { assertValidPost } from '@/lib/domain/posts/validation';
import type { MediaObjectStore } from '@/lib/aws/media/object-store';
import { isOwnedImageKey } from '@/lib/aws/media/service';
import { slugify } from '@/lib/utils/slugify';

import {
  AdminBackupTooLargeError,
  backupFilename,
  createDynamoDbBackup,
} from './backup';
import type { BackupEnvironment } from '@/lib/aws/backup-contract';
import {
  AdminStoreConflictError,
  AdminStoreNotFoundError,
  DynamoDbAdminStore,
  type AdminCategory,
  type AdminKeyword,
  type MutationReservation,
  type StoredMutationResult,
} from './store';

export type AdminApiEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  routeKey?: string;
};

export type AdminApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type MediaOperations = {
  inspect(postId: string): Promise<MediaInspection>;
  createUpload(
    postId: string,
    descriptor: ReturnType<typeof validateUploadDescriptor>,
    idempotencyKey: string
  ): Promise<PresignedImageUpload>;
  confirmUpload(input: {
    postId: string;
    uploadId: string;
    title: string;
    alt: string;
    idempotencyKey: string;
  }): Promise<ConfirmedImageUpload>;
};

type AdminLogger = {
  info(event: Record<string, unknown>): void;
  warn(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
};

export type AdminApiDependencies = {
  posts: PostRepository;
  store: DynamoDbAdminStore;
  media: MediaOperations;
  objects: Pick<MediaObjectStore, 'delete'>;
  environment: BackupEnvironment;
  security: {
    issuer: string;
    clientId: string;
    adminScope: string;
  };
  clock?: () => Date;
  logger?: AdminLogger;
};

type AuthenticatedAdmin = { subject: string };

type ValidationIssue = { path: string; code: string; message: string };

class ApiValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';

  constructor(readonly issues: ValidationIssue[]) {
    super('Request validation failed');
    this.name = 'ApiValidationError';
  }
}

class ApiUnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
}

class ApiForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
}

class ApiConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiConflictError';
    this.code = code;
  }
}

const API_VERSION = 1;
const MAX_JSON_BODY_BYTES = 256 * 1024;
const MAX_LIST_LIMIT = 50;
const MAX_BULK_POSTS = 100;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const UPLOAD_ID_PATTERN = /^[a-f0-9]{64}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const NOOP_LOGGER: AdminLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validation(
  path: string,
  code: string,
  message: string
): ApiValidationError {
  return new ApiValidationError([{ path, code, message }]);
}

function header(event: AdminApiEvent, name: string): string | undefined {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === expected) return value;
  }
  return undefined;
}

function correlationId(event: AdminApiEvent): string {
  const supplied = header(event, 'x-correlation-id');
  if (supplied && CORRELATION_ID_PATTERN.test(supplied)) return supplied;
  return event.requestContext?.requestId ?? 'unknown';
}

function response(
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

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  headers: Record<string, string> = {}
): AdminApiResponse {
  return response(statusCode, { error: { code, message } }, requestId, headers);
}

function postResponse(
  statusCode: number,
  post: Post,
  requestId: string,
  replayed = false
): AdminApiResponse {
  return response(statusCode, { data: { post, replayed } }, requestId, {
    etag: `"${post.version}"`,
  });
}

function parseBody(event: AdminApiEvent): unknown {
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

function recordBody(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw validation('body', 'INVALID_BODY', 'A JSON object is required');
  }
  return value;
}

function stringField(
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

function numberField(
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

function booleanField(
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

function validateId(value: unknown, path = 'id'): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw validation(
      path,
      'INVALID_ID',
      'Must contain only letters, digits, underscores, or hyphens'
    );
  }
  return value;
}

function pathId(event: AdminApiEvent): string {
  return validateId(event.pathParameters?.id, 'id');
}

function pathImageRole(event: AdminApiEvent): ImageRole {
  const role = event.pathParameters?.role;
  if (role !== 'main' && role !== 'thumb') {
    throw validation(
      'role',
      'INVALID_IMAGE_ROLE',
      'Role must be main or thumb'
    );
  }
  return role;
}

function claimContains(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) return value.includes(expected);
  return String(value ?? '')
    .split(' ')
    .includes(expected);
}

function authenticate(
  event: AdminApiEvent,
  security: AdminApiDependencies['security']
): AuthenticatedAdmin {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  const clientId = claims.client_id ?? claims.aud;
  if (
    claims.iss !== security.issuer ||
    clientId !== security.clientId ||
    claims.token_use !== 'access' ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0
  ) {
    throw new ApiUnauthorizedError('Authentication claims are invalid');
  }
  if (!claimContains(claims.scope, security.adminScope)) {
    throw new ApiForbiddenError('Admin access is required');
  }
  return { subject: claims.sub };
}

function requireIdempotencyKey(event: AdminApiEvent): string {
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

function expectedVersion(event: AdminApiEvent): number {
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

function mutationDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function parseKeyword(value: unknown, path: string): PostKeyword {
  const record = recordBody(value);
  return {
    id: validateId(record.id, `${path}.id`),
    value: stringField(record, 'value', `${path}.value`, 60),
  };
}

function parseReference(value: unknown, path: string): PostReference {
  const record = recordBody(value);
  const type = record.type;
  if (type !== 'image' && type !== 'text') {
    throw validation(
      `${path}.type`,
      'INVALID_REFERENCE_TYPE',
      'Must be image or text'
    );
  }
  const blockquote = record.blockquote;
  if (blockquote !== undefined && typeof blockquote !== 'string') {
    throw validation(
      `${path}.blockquote`,
      'INVALID_STRING',
      'Must be a string'
    );
  }
  return {
    id: validateId(record.id, `${path}.id`),
    type,
    reference: stringField(record, 'reference', `${path}.reference`, 2048),
    ...(blockquote === undefined ? {} : { blockquote }),
    sortOrder: numberField(record, 'sortOrder', `${path}.sortOrder`),
  };
}

function parseTranslation(value: unknown, path: string): PostTranslation {
  const record = recordBody(value);
  const keywords = record.keywords;
  const references = record.references;
  if (!Array.isArray(keywords) || !Array.isArray(references)) {
    throw validation(
      path,
      'INVALID_RELATIONSHIPS',
      'Keywords and references must be arrays'
    );
  }
  const translationStatus = record.translationStatus;
  if (translationStatus !== 'complete' && translationStatus !== 'incomplete') {
    throw validation(
      `${path}.translationStatus`,
      'INVALID_TRANSLATION_STATUS',
      'Must be complete or incomplete'
    );
  }
  return {
    id: validateId(record.id, `${path}.id`),
    title: stringField(record, 'title', `${path}.title`, 200, true),
    content: stringField(record, 'content', `${path}.content`, 50_000, true),
    slug: stringField(record, 'slug', `${path}.slug`, 250, true),
    keywords: keywords.map((keyword, index) =>
      parseKeyword(keyword, `${path}.keywords.${index}`)
    ),
    references: references.map((reference, index) =>
      parseReference(reference, `${path}.references.${index}`)
    ),
    translationStatus,
  };
}

function parseImage(value: unknown, path: string): PostImage | null {
  if (value === null) return null;
  const record = recordBody(value);
  return {
    key: stringField(record, 'key', `${path}.key`, 1024),
    title: stringField(record, 'title', `${path}.title`, 200, true),
    alt: stringField(record, 'alt', `${path}.alt`, 300, true),
    contentType: stringField(record, 'contentType', `${path}.contentType`, 120),
    sizeBytes: numberField(record, 'sizeBytes', `${path}.sizeBytes`, 1),
    createdAt: stringField(record, 'createdAt', `${path}.createdAt`, 40),
    updatedAt: stringField(record, 'updatedAt', `${path}.updatedAt`, 40),
  };
}

function parsePost(value: unknown): Post {
  const record = recordBody(value);
  const category = recordBody(record.category);
  const translations = recordBody(record.translations);
  const migration = record.migration;
  if (migration !== null && migration !== undefined && !isRecord(migration)) {
    throw validation(
      'migration',
      'INVALID_MIGRATION',
      'Migration metadata must be null or an object'
    );
  }
  if (
    isRecord(migration) &&
    migration.source !== undefined &&
    migration.source !== 'supabase-backup'
  ) {
    throw validation(
      'migration.source',
      'INVALID_MIGRATION_SOURCE',
      'Migration source is not supported'
    );
  }
  const post: Post = {
    id: validateId(record.id),
    category: {
      id: validateId(category.id, 'category.id'),
      slug: stringField(category, 'slug', 'category.slug', 120),
    },
    sortOrder: numberField(record, 'sortOrder', 'sortOrder', 0),
    published: booleanField(record, 'published', 'published'),
    date: stringField(record, 'date', 'date', 10),
    author: stringField(record, 'author', 'author', 120),
    createdAt: stringField(record, 'createdAt', 'createdAt', 40),
    updatedAt: stringField(record, 'updatedAt', 'updatedAt', 40),
    translations: {
      ca: parseTranslation(translations.ca, 'translations.ca'),
      en: parseTranslation(translations.en, 'translations.en'),
    },
    mainImage: parseImage(record.mainImage, 'mainImage'),
    thumbImage: parseImage(record.thumbImage, 'thumbImage'),
    version: numberField(record, 'version', 'version', 1),
    migration:
      migration === null || migration === undefined
        ? null
        : {
            source: 'supabase-backup',
            runId: stringField(migration, 'runId', 'migration.runId', 200),
          },
  };
  try {
    assertValidPost(post);
  } catch (error) {
    if (error instanceof PostValidationError) {
      throw new ApiValidationError(error.issues);
    }
    throw error;
  }
  return post;
}

function parseCategory(
  value: unknown,
  id?: string
): Pick<AdminCategory, 'id' | 'slug' | 'names'> {
  const record = recordBody(value);
  const names = recordBody(record.names);
  const parsedId = validateId(id ?? record.id);
  if (id !== undefined && record.id !== undefined && record.id !== id) {
    throw validation('id', 'ID_MISMATCH', 'Body ID must match the route ID');
  }
  const slug = stringField(record, 'slug', 'slug', 120);
  if (slugify(slug) !== slug) {
    throw validation('slug', 'SLUG_NOT_NORMALIZED', 'Slug must be normalized');
  }
  return {
    id: parsedId,
    slug,
    names: {
      ca: stringField(names, 'ca', 'names.ca', 200),
      en: stringField(names, 'en', 'names.en', 200),
    },
  };
}

function parseAdminKeyword(
  value: unknown,
  id?: string
): Pick<AdminKeyword, 'id' | 'language' | 'value'> {
  const record = recordBody(value);
  const parsedId = validateId(id ?? record.id);
  if (id !== undefined && record.id !== undefined && record.id !== id) {
    throw validation('id', 'ID_MISMATCH', 'Body ID must match the route ID');
  }
  if (record.language !== 'ca' && record.language !== 'en') {
    throw validation(
      'language',
      'INVALID_LANGUAGE',
      'Language must be ca or en'
    );
  }
  return {
    id: parsedId,
    language: record.language,
    value: stringField(record, 'value', 'value', 60),
  };
}

function parseListOptions(event: AdminApiEvent) {
  const query = event.queryStringParameters ?? {};
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw validation(
      'limit',
      'INVALID_PAGE_LIMIT',
      `Limit must be an integer between 1 and ${MAX_LIST_LIMIT}`
    );
  }
  const rawDirection = query.direction;
  if (
    rawDirection !== undefined &&
    rawDirection !== 'ascending' &&
    rawDirection !== 'descending'
  ) {
    throw validation(
      'direction',
      'INVALID_DIRECTION',
      'Direction must be ascending or descending'
    );
  }
  const direction: 'ascending' | 'descending' | undefined = rawDirection;
  let published: boolean | undefined;
  if (query.published !== undefined) {
    if (query.published !== 'true' && query.published !== 'false') {
      throw validation(
        'published',
        'INVALID_BOOLEAN',
        'Published must be true or false'
      );
    }
    published = query.published === 'true';
  }
  if (query.title !== undefined && query.title.length > 200) {
    throw validation('title', 'INVALID_STRING', 'Title filter is too long');
  }
  let imageStatus: ImageInventoryStatus | undefined;
  if (query.imageStatus !== undefined) {
    if (!IMAGE_INVENTORY_STATUSES.includes(query.imageStatus as never)) {
      throw validation(
        'imageStatus',
        'INVALID_IMAGE_STATUS',
        `Image status must be one of ${IMAGE_INVENTORY_STATUSES.join(', ')}`
      );
    }
    imageStatus = query.imageStatus as ImageInventoryStatus;
  }
  return {
    limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(direction ? { direction } : {}),
    ...(query.title ? { title: query.title } : {}),
    ...(published === undefined ? {} : { published }),
    ...(query.categoryId
      ? { categoryId: validateId(query.categoryId, 'categoryId') }
      : {}),
    ...(imageStatus ? { imageStatus } : {}),
  };
}

function parseConfirmBody(value: unknown): {
  uploadId: string;
  title: string;
  alt: string;
} {
  const record = recordBody(value);
  if (
    typeof record.uploadId !== 'string' ||
    !UPLOAD_ID_PATTERN.test(record.uploadId)
  ) {
    throw validation(
      'uploadId',
      'INVALID_UPLOAD_ID',
      'A valid upload ID is required'
    );
  }
  return {
    uploadId: record.uploadId,
    title: validateImageText(record.title, 'title'),
    alt: validateImageText(record.alt, 'alt'),
  };
}

function reservationResult(
  reservation: MutationReservation
): StoredMutationResult | null {
  return reservation.state === 'replay' ? reservation.result : null;
}

function requiredReservation(
  reservation: MutationReservation
): Extract<MutationReservation, { state: 'reserved' }> {
  if (reservation.state !== 'reserved') {
    throw new TypeError('Mutation reservation is not writable');
  }
  return reservation;
}

type BulkPublicationTarget = { id: string; version: number };

function bulkPublicationTargets(
  reservation: Extract<MutationReservation, { state: 'reserved' }>
): BulkPublicationTarget[] {
  const context = reservation.context;
  if (
    !context ||
    context.operation !== 'bulk-publication-v1' ||
    !Array.isArray(context.targets)
  ) {
    throw new TypeError('Stored bulk publication context is invalid');
  }
  return context.targets.map((value, index) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !ID_PATTERN.test(value.id) ||
      !Number.isSafeInteger(value.version) ||
      (value.version as number) < 1
    ) {
      throw new TypeError(`Stored bulk publication target ${index} is invalid`);
    }
    return { id: value.id, version: value.version as number };
  });
}

function resultString(result: StoredMutationResult, field: string): string {
  const value = result[field];
  if (typeof value !== 'string') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

function resultStrings(result: StoredMutationResult, field: string): string[] {
  const value = result[field];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

function resultNullableString(
  result: StoredMutationResult,
  field: string
): string | null {
  const value = result[field];
  if (value !== null && typeof value !== 'string') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

function resultBoolean(result: StoredMutationResult, field: string): boolean {
  const value = result[field];
  if (typeof value !== 'boolean') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

function resultInteger(result: StoredMutationResult, field: string): number {
  const value = result[field];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value as number;
}

function isThrottled(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return [
    'ThrottlingException',
    'ProvisionedThroughputExceededException',
    'RequestLimitExceeded',
    'TooManyRequestsException',
  ].includes(String(error.name));
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : 'UnknownError';
}

function mappedError(
  error: unknown,
  requestId: string,
  logger: AdminLogger,
  routeKey: string
): AdminApiResponse {
  if (error instanceof ApiValidationError) {
    const first = error.issues[0];
    const tooLarge = first?.code === 'BODY_TOO_LARGE';
    return errorResponse(
      tooLarge ? 413 : 400,
      first?.code ?? error.code,
      first?.message ?? error.message,
      requestId
    );
  }
  if (error instanceof MediaValidationError) {
    const first = error.issues[0];
    const tooLarge =
      first?.code === 'BODY_TOO_LARGE' || first?.code === 'INVALID_IMAGE_SIZE';
    return errorResponse(
      tooLarge ? 413 : 400,
      first?.code ?? error.code,
      first?.message ?? error.message,
      requestId
    );
  }
  if (error instanceof ApiUnauthorizedError) {
    return errorResponse(401, error.code, 'Sign-in required', requestId);
  }
  if (error instanceof ApiForbiddenError) {
    return errorResponse(403, error.code, 'Access denied', requestId);
  }
  if (
    error instanceof PostNotFoundError ||
    error instanceof AdminStoreNotFoundError ||
    error instanceof MediaUploadNotFoundError
  ) {
    return errorResponse(404, 'NOT_FOUND', 'Resource not found', requestId);
  }
  if (error instanceof AdminStoreConflictError) {
    const conflict = {
      version: {
        code: 'VERSION_CONFLICT',
        message: 'The resource was changed by another operation',
      },
      idempotency: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key is already in use',
      },
      backup: {
        code: 'BACKUP_CHANGED_DURING_EXPORT',
        message: 'Data changed during backup; retry the download',
      },
    }[error.reason];
    return errorResponse(409, conflict.code, conflict.message, requestId);
  }
  if (
    error instanceof PostVersionConflictError ||
    error instanceof PostSlugConflictError ||
    error instanceof MediaUploadConflictError ||
    error instanceof ApiConflictError
  ) {
    return errorResponse(
      409,
      error instanceof ApiConflictError ? error.code : error.code,
      error.message,
      requestId
    );
  }
  if (error instanceof MediaUploadExpiredError) {
    return errorResponse(410, error.code, error.message, requestId);
  }
  if (error instanceof MediaUploadIntegrityError) {
    return errorResponse(400, error.code, error.message, requestId);
  }
  if (
    error instanceof PostAggregateTooLargeError ||
    error instanceof AdminBackupTooLargeError
  ) {
    return errorResponse(413, error.code, error.message, requestId);
  }
  if (isThrottled(error)) {
    return errorResponse(
      429,
      'THROTTLED',
      'The service is busy; retry later',
      requestId,
      { 'retry-after': '1' }
    );
  }
  logger.error({
    message: 'admin_api_request_failed',
    requestId,
    routeKey,
    errorName: safeErrorName(error),
    dataIntegrityFailure: error instanceof PostDataIntegrityError,
  });
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'The request could not be completed',
    requestId
  );
}

async function cleanupImages(
  postId: string,
  imageKeys: string[],
  objects: Pick<MediaObjectStore, 'delete'>,
  logger: AdminLogger,
  logScope = 'post_delete',
  role?: ImageRole
): Promise<{ pending: boolean; failedCount: number }> {
  const ownedKeys = imageKeys.filter(key => {
    if (role) return isOwnedImageKey(postId, role, key);
    return (
      isOwnedImageKey(postId, 'main', key) ||
      isOwnedImageKey(postId, 'thumb', key)
    );
  });
  const skippedCount = imageKeys.length - ownedKeys.length;
  if (skippedCount > 0) {
    logger.warn({
      message: `${logScope}_unowned_image_cleanup_skipped`,
      postId,
      skippedCount,
    });
  }
  const cleanup = await Promise.allSettled(
    [...new Set(ownedKeys)].map(key => objects.delete(key))
  );
  const failedCount = cleanup.filter(
    result => result.status === 'rejected'
  ).length;
  if (failedCount > 0) {
    logger.warn({
      message: `${logScope}_image_cleanup_incomplete`,
      postId,
      failedCount,
    });
  }
  return { pending: failedCount > 0, failedCount };
}

export function createAdminApiHandler(dependencies: AdminApiDependencies) {
  const clock = dependencies.clock ?? (() => new Date());
  const logger = dependencies.logger ?? NOOP_LOGGER;

  return async function handler(
    event: AdminApiEvent
  ): Promise<AdminApiResponse> {
    const requestId = correlationId(event);
    const routeKey = event.routeKey ?? '';
    try {
      const admin = authenticate(event, dependencies.security);

      if (routeKey === 'GET /health') {
        return response(200, { data: { status: 'ok' } }, requestId);
      }

      if (routeKey === 'GET /posts') {
        const page = await dependencies.posts.list(parseListOptions(event));
        return response(200, { data: page }, requestId);
      }

      if (routeKey === 'POST /posts') {
        const post = parsePost(parseBody(event));
        if (
          post.migration !== null ||
          post.mainImage !== null ||
          post.thumbImage !== null
        ) {
          throw validation(
            'body',
            'READ_ONLY_FIELDS',
            'New posts cannot set migration metadata or image objects'
          );
        }
        const key = requireIdempotencyKey(event);
        const reservation = await dependencies.store.reserveMutation({
          scope: routeKey,
          subject: admin.subject,
          key,
          requestDigest: mutationDigest(post),
        });
        const replay = reservationResult(reservation);
        if (replay) {
          const existing = await dependencies.posts.getById(
            resultString(replay, 'postId')
          );
          if (!existing) {
            throw new ApiConflictError(
              'IDEMPOTENCY_RESULT_GONE',
              'The original mutation result no longer exists'
            );
          }
          return postResponse(200, existing, requestId, true);
        }
        const created = await dependencies.posts.create(post);
        await dependencies.store.completeMutation(
          requiredReservation(reservation),
          {
            postId: created.id,
          }
        );
        return postResponse(201, created, requestId);
      }

      if (routeKey === 'POST /posts/publication/bulk') {
        const body = recordBody(parseBody(event));
        if (body.published !== true || body.confirmation !== 'PUBLISH_ALL') {
          throw validation(
            'confirmation',
            'CONFIRMATION_REQUIRED',
            'Bulk publication requires published=true and confirmation=PUBLISH_ALL'
          );
        }
        const expectedCount = numberField(
          body,
          'expectedCount',
          'expectedCount',
          1
        );
        if (expectedCount > MAX_BULK_POSTS) {
          throw validation(
            'expectedCount',
            'BULK_LIMIT_EXCEEDED',
            `Bulk publication is capped at ${MAX_BULK_POSTS} posts`
          );
        }
        const key = requireIdempotencyKey(event);
        const reservationInput = {
          scope: routeKey,
          subject: admin.subject,
          key,
          requestDigest: mutationDigest(body),
          resumePending: true,
        } as const;
        let reservation =
          await dependencies.store.findMutation(reservationInput);
        if (!reservation) {
          let cursor: string | undefined;
          const drafts: BulkPublicationTarget[] = [];
          do {
            const page = await dependencies.posts.list({
              limit: 50,
              cursor,
              published: false,
              direction: 'ascending',
            });
            drafts.push(
              ...page.items.map(item => ({
                id: item.id,
                version: item.version,
              }))
            );
            if (drafts.length > MAX_BULK_POSTS) {
              throw new ApiConflictError(
                'BULK_LIMIT_EXCEEDED',
                `Bulk publication is capped at ${MAX_BULK_POSTS} posts`
              );
            }
            cursor = page.nextCursor ?? undefined;
          } while (cursor !== undefined);
          if (drafts.length !== expectedCount) {
            throw new ApiConflictError(
              'BULK_COUNT_MISMATCH',
              `Expected ${expectedCount} drafts but found ${drafts.length}`
            );
          }
          reservation = await dependencies.store.reserveMutation({
            ...reservationInput,
            pendingContext: {
              operation: 'bulk-publication-v1',
              targets: drafts,
            },
          });
        }
        const replay = reservationResult(reservation);
        if (replay) {
          return response(
            200,
            {
              data: {
                publishedCount: replay.publishedCount,
                replayed: true,
              },
            },
            requestId
          );
        }
        const writableReservation = requiredReservation(reservation);
        const targets = bulkPublicationTargets(writableReservation);
        for (const target of targets) {
          const post = await dependencies.posts.getById(target.id);
          if (!post) throw new PostNotFoundError(target.id);
          if (post.published) continue;
          await dependencies.posts.update(
            { ...post, published: true },
            target.version
          );
        }
        const publishedCount = targets.length;
        await dependencies.store.completeMutation(writableReservation, {
          publishedCount,
        });
        return response(
          200,
          { data: { publishedCount, replayed: false } },
          requestId
        );
      }

      if (routeKey === 'GET /categories') {
        const categories = await dependencies.store.listCategories();
        return response(200, { data: { items: categories } }, requestId);
      }

      if (routeKey === 'POST /categories') {
        const category = parseCategory(parseBody(event));
        const key = requireIdempotencyKey(event);
        const reservation = await dependencies.store.reserveMutation({
          scope: routeKey,
          subject: admin.subject,
          key,
          requestDigest: mutationDigest(category),
        });
        const replay = reservationResult(reservation);
        if (replay) {
          const existing = await dependencies.store.getCategory(
            resultString(replay, 'categoryId')
          );
          if (!existing) throw new AdminStoreNotFoundError('category');
          return response(
            200,
            { data: { category: existing, replayed: true } },
            requestId,
            { etag: `"${existing.version}"` }
          );
        }
        const created = await dependencies.store.createCategory(category);
        await dependencies.store.completeMutation(
          requiredReservation(reservation),
          {
            categoryId: created.id,
          }
        );
        return response(
          201,
          { data: { category: created, replayed: false } },
          requestId,
          { etag: `"${created.version}"` }
        );
      }

      if (routeKey === 'GET /keywords') {
        const language = event.queryStringParameters?.language;
        if (language !== undefined && language !== 'ca' && language !== 'en') {
          throw validation(
            'language',
            'INVALID_LANGUAGE',
            'Language must be ca or en'
          );
        }
        const keywords = await dependencies.store.listKeywords(language);
        return response(200, { data: { items: keywords } }, requestId);
      }

      if (routeKey === 'POST /keywords') {
        const keyword = parseAdminKeyword(parseBody(event));
        const key = requireIdempotencyKey(event);
        const reservation = await dependencies.store.reserveMutation({
          scope: routeKey,
          subject: admin.subject,
          key,
          requestDigest: mutationDigest(keyword),
        });
        const replay = reservationResult(reservation);
        if (replay) {
          const existing = await dependencies.store.getKeyword(
            resultString(replay, 'keywordId')
          );
          if (!existing) throw new AdminStoreNotFoundError('keyword');
          return response(
            200,
            { data: { keyword: existing, replayed: true } },
            requestId,
            { etag: `"${existing.version}"` }
          );
        }
        const created = await dependencies.store.createKeyword(keyword);
        await dependencies.store.completeMutation(
          requiredReservation(reservation),
          {
            keywordId: created.id,
          }
        );
        return response(
          201,
          { data: { keyword: created, replayed: false } },
          requestId,
          { etag: `"${created.version}"` }
        );
      }

      if (routeKey === 'GET /backup') {
        const scanned = await dependencies.store.scanAll();
        const backup = createDynamoDbBackup({
          ...scanned,
          exportedAt: clock().toISOString(),
          environment: dependencies.environment,
        });
        logger.info({
          message: 'admin_backup_created',
          requestId,
          itemCount: backup.manifest.itemCount,
          pageCount: backup.manifest.pageCount,
        });
        return {
          statusCode: 200,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="${backupFilename(
              backup.environment,
              backup.exportedAt
            )}"`,
            'x-correlation-id': requestId,
          },
          body: JSON.stringify(backup),
        };
      }

      if (
        routeKey === 'GET /posts/{id}' ||
        routeKey === 'PUT /posts/{id}' ||
        routeKey === 'DELETE /posts/{id}' ||
        routeKey === 'PUT /posts/{id}/publication' ||
        routeKey === 'GET /posts/{id}/images' ||
        routeKey === 'POST /posts/{id}/images/presign' ||
        routeKey === 'POST /posts/{id}/images/confirm' ||
        routeKey === 'DELETE /posts/{id}/images/{role}' ||
        routeKey === 'PUT /categories/{id}' ||
        routeKey === 'DELETE /categories/{id}' ||
        routeKey === 'PUT /keywords/{id}' ||
        routeKey === 'DELETE /keywords/{id}'
      ) {
        const id = pathId(event);

        if (routeKey === 'GET /posts/{id}') {
          const post = await dependencies.posts.getById(id);
          return post
            ? postResponse(200, post, requestId)
            : errorResponse(404, 'NOT_FOUND', 'Post not found', requestId);
        }

        if (routeKey === 'PUT /posts/{id}') {
          const post = parsePost(parseBody(event));
          if (post.id !== id) {
            throw validation(
              'id',
              'ID_MISMATCH',
              'Body ID must match the route ID'
            );
          }
          const version = expectedVersion(event);
          const current = await dependencies.posts.getById(id);
          if (!current) throw new PostNotFoundError(id);
          if (post.published !== current.published) {
            throw validation(
              'published',
              'PUBLICATION_ROUTE_REQUIRED',
              'Use the publication route to change publication state'
            );
          }
          const safePost: Post = {
            ...post,
            published: current.published,
            mainImage: current.mainImage,
            thumbImage: current.thumbImage,
          };
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ post: safePost, version }),
          });
          const replay = reservationResult(reservation);
          if (replay) {
            const existing = await dependencies.posts.getById(id);
            if (!existing) throw new PostNotFoundError(id);
            return postResponse(200, existing, requestId, true);
          }
          const updated = await dependencies.posts.update(safePost, version);
          await dependencies.store.completeMutation(
            requiredReservation(reservation),
            { postId: id }
          );
          return postResponse(200, updated, requestId);
        }

        if (routeKey === 'DELETE /posts/{id}') {
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ id, version }),
          });
          const replay = reservationResult(reservation);
          let imageKeys: string[];
          if (replay) {
            imageKeys = resultStrings(replay, 'imageKeys');
          } else {
            const deleted = await dependencies.posts.delete(id, version);
            imageKeys = deleted.imageKeys;
            await dependencies.store.completeMutation(
              requiredReservation(reservation),
              {
                postId: deleted.postId,
                imageKeys,
              }
            );
          }
          const cleanup = await cleanupImages(
            id,
            imageKeys,
            dependencies.objects,
            logger
          );
          return response(
            200,
            {
              data: {
                postId: id,
                cleanup: {
                  ...cleanup,
                  retryWithSameIdempotencyKey: cleanup.pending,
                },
                replayed: replay !== null,
              },
            },
            requestId
          );
        }

        if (routeKey === 'PUT /posts/{id}/publication') {
          const body = recordBody(parseBody(event));
          const published = booleanField(body, 'published', 'published');
          const expectedConfirmation = published ? 'PUBLISH' : 'UNPUBLISH';
          if (body.confirmation !== expectedConfirmation) {
            throw validation(
              'confirmation',
              'CONFIRMATION_REQUIRED',
              `Confirmation must be ${expectedConfirmation}`
            );
          }
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ id, version, published }),
          });
          const replay = reservationResult(reservation);
          if (replay) {
            const existing = await dependencies.posts.getById(id);
            if (!existing) throw new PostNotFoundError(id);
            return postResponse(200, existing, requestId, true);
          }
          const post = await dependencies.posts.getById(id);
          if (!post) throw new PostNotFoundError(id);
          const updated = await dependencies.posts.update(
            { ...post, published },
            version
          );
          await dependencies.store.completeMutation(
            requiredReservation(reservation),
            { postId: id }
          );
          return postResponse(200, updated, requestId);
        }

        if (routeKey === 'PUT /categories/{id}') {
          const category = parseCategory(parseBody(event), id);
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ category, version }),
          });
          const replay = reservationResult(reservation);
          if (replay) {
            const existing = await dependencies.store.getCategory(id);
            if (!existing) throw new AdminStoreNotFoundError('category');
            return response(
              200,
              { data: { category: existing, replayed: true } },
              requestId,
              { etag: `"${existing.version}"` }
            );
          }
          const updated = await dependencies.store.updateCategory(
            category,
            version
          );
          await dependencies.store.completeMutation(
            requiredReservation(reservation),
            {
              categoryId: id,
            }
          );
          return response(
            200,
            { data: { category: updated, replayed: false } },
            requestId,
            { etag: `"${updated.version}"` }
          );
        }

        if (routeKey === 'DELETE /categories/{id}') {
          const version = expectedVersion(event);
          const inUse = await dependencies.posts.list({
            limit: 1,
            categoryId: id,
          });
          if (inUse.items.length > 0) {
            throw new ApiConflictError(
              'CATEGORY_IN_USE',
              'Category is referenced by at least one post'
            );
          }
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ id, version }),
          });
          const replay = reservationResult(reservation);
          if (!replay) {
            await dependencies.store.deleteCategory(id, version);
            await dependencies.store.completeMutation(
              requiredReservation(reservation),
              {
                categoryId: id,
              }
            );
          }
          return response(
            200,
            { data: { categoryId: id, replayed: replay !== null } },
            requestId
          );
        }

        if (routeKey === 'PUT /keywords/{id}') {
          const keyword = parseAdminKeyword(parseBody(event), id);
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ keyword, version }),
          });
          const replay = reservationResult(reservation);
          if (replay) {
            const existing = await dependencies.store.getKeyword(id);
            if (!existing) throw new AdminStoreNotFoundError('keyword');
            return response(
              200,
              { data: { keyword: existing, replayed: true } },
              requestId,
              { etag: `"${existing.version}"` }
            );
          }
          const updated = await dependencies.store.updateKeyword(
            keyword,
            version
          );
          await dependencies.store.completeMutation(
            requiredReservation(reservation),
            {
              keywordId: id,
            }
          );
          return response(
            200,
            { data: { keyword: updated, replayed: false } },
            requestId,
            { etag: `"${updated.version}"` }
          );
        }

        if (routeKey === 'DELETE /keywords/{id}') {
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ id, version }),
          });
          const replay = reservationResult(reservation);
          if (!replay) {
            await dependencies.store.deleteKeyword(id, version);
            await dependencies.store.completeMutation(
              requiredReservation(reservation),
              {
                keywordId: id,
              }
            );
          }
          return response(
            200,
            { data: { keywordId: id, replayed: replay !== null } },
            requestId
          );
        }

        if (routeKey === 'GET /posts/{id}/images') {
          const inspection = await dependencies.media.inspect(id);
          return response(200, { data: inspection }, requestId);
        }
        if (routeKey === 'POST /posts/{id}/images/presign') {
          const descriptor = validateUploadDescriptor(parseBody(event));
          const upload = await dependencies.media.createUpload(
            id,
            descriptor,
            requireIdempotencyKey(event)
          );
          return response(201, { data: upload }, requestId);
        }
        if (routeKey === 'POST /posts/{id}/images/confirm') {
          const body = parseConfirmBody(parseBody(event));
          const confirmed = await dependencies.media.confirmUpload({
            postId: id,
            ...body,
            idempotencyKey: requireIdempotencyKey(event),
          });
          return response(200, { data: confirmed }, requestId);
        }
        if (routeKey === 'DELETE /posts/{id}/images/{role}') {
          const role = pathImageRole(event);
          const version = expectedVersion(event);
          const key = requireIdempotencyKey(event);
          const reservation = await dependencies.store.reserveMutation({
            scope: routeKey,
            subject: admin.subject,
            key,
            requestDigest: mutationDigest({ id, role, version }),
          });
          const replay = reservationResult(reservation);
          let postVersion: number;
          let previousImageKey: string | null;
          let detached: boolean;
          if (replay) {
            postVersion = resultInteger(replay, 'postVersion');
            previousImageKey = resultNullableString(replay, 'previousImageKey');
            detached = resultBoolean(replay, 'detached');
          } else {
            const result = await dependencies.posts.detachImage(
              id,
              role,
              version
            );
            postVersion = result.version;
            previousImageKey = result.previousImageKey;
            detached = result.detached;
            await dependencies.store.completeMutation(
              requiredReservation(reservation),
              { postVersion, previousImageKey, detached }
            );
          }
          const cleanup = previousImageKey
            ? await cleanupImages(
                id,
                [previousImageKey],
                dependencies.objects,
                logger,
                'image_detach',
                role
              )
            : { pending: false, failedCount: 0 };
          return response(
            200,
            {
              data: {
                postId: id,
                postVersion,
                role,
                detached,
                cleanup: {
                  ...cleanup,
                  retryWithSameIdempotencyKey: cleanup.pending,
                },
                replayed: replay !== null,
              },
            },
            requestId
          );
        }
      }

      return errorResponse(404, 'NOT_FOUND', 'Route not found', requestId);
    } catch (error) {
      return mappedError(error, requestId, logger, routeKey);
    }
  };
}
