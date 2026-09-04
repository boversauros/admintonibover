'use client';

import { redirectIfSessionExpired } from '@/lib/auth/client-session';
import {
  parseAdminApiErrorEnvelope,
  parsePostDetailEnvelope,
  type AdminApiSuccessEnvelope,
} from '@/lib/aws/admin-read-contract';
import type { AdminDataBackend } from '@/lib/config/adminBackend';
import {
  type ConfirmedImageUpload,
  type DetachedImage,
  type ImagePreview,
  type ImageRole,
  type MediaInspection,
  type PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import { validateUploadDescriptor } from '@/lib/domain/media/validation';
import type {
  Post,
  PostImage,
  PostLanguage,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';
import type { StoredPost } from '@/lib/types/post';

import { AWS_ADMIN_POST_PAGE_LIMIT, getAdminPostsPage } from './adminReads';

const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504]);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const MAX_BULK_POSTS = 100;

type AwsMutationMethod = 'POST' | 'PUT' | 'DELETE';
type SuccessParser<T> = (value: unknown) => AdminApiSuccessEnvelope<T>;

type MutationRequest<T> = {
  body?: unknown;
  expectedVersion?: number;
  fetchImplementation?: typeof fetch;
  idempotencyKey: string;
  method: AwsMutationMethod;
  parseSuccess: SuccessParser<T>;
  path: string;
  signal?: AbortSignal;
};

export type ImageUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type PresignedUploadTransport = (input: {
  file: File;
  onProgress?: (progress: ImageUploadProgress) => void;
  signal?: AbortSignal;
  upload: PresignedImageUpload;
}) => Promise<void>;

export type DeletePostMutationResult = {
  postId: string;
  cleanup: {
    pending: boolean;
    failedCount: number;
    retryWithSameIdempotencyKey: boolean;
  };
  replayed: boolean;
};

export type BulkPublicationResult = {
  publishedCount: number;
  replayed: boolean;
};

export class AdminMutationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryAfter?: string
  ) {
    super(message);
    this.name = 'AdminMutationError';
  }
}

function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string')
    throw new TypeError(`${path} must be a string`);
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

function integerValue(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${path} must be an integer`);
  }
  return value as number;
}

function nullableStringValue(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringValue(value, path);
}

function parseSuccessEnvelope<T>(
  value: unknown,
  parseData: (data: unknown) => T
): AdminApiSuccessEnvelope<T> {
  const envelope = recordValue(value, 'response');
  if (envelope.version !== 1) {
    throw new TypeError('response.version is invalid');
  }
  return {
    version: 1,
    data: parseData(envelope.data),
    requestId: stringValue(envelope.requestId, 'response.requestId'),
  };
}

function friendlyMutationMessage(status: number, fallback: string): string {
  if (status === 0) {
    return 'No s’ha pogut contactar amb el servei. Torna-ho a provar.';
  }
  if (status === 400 || status === 413 || status === 415) return fallback;
  if (status === 401) return 'La sessió ha caducat. Torna a iniciar sessió.';
  if (status === 403) return 'No tens permisos per fer aquesta operació.';
  if (status === 404) return 'L’article ja no existeix.';
  if (status === 409) {
    return 'L’article ha canviat des que el vas obrir. Recarrega la versió actual abans de continuar.';
  }
  if (status === 429) {
    return 'S’han fet massa operacions. Espera un moment i torna-ho a provar.';
  }
  if (status >= 500) {
    return 'El servei d’escriptura no està disponible ara mateix.';
  }
  return fallback;
}

async function requestAwsMutation<T>({
  body,
  expectedVersion,
  fetchImplementation = fetch,
  idempotencyKey,
  method,
  parseSuccess,
  path,
  signal,
}: MutationRequest<T>): Promise<AdminApiSuccessEnvelope<T>> {
  const correlationId = crypto.randomUUID();
  let lastNetworkError = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImplementation(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
        headers: {
          accept: 'application/json',
          'idempotency-key': idempotencyKey,
          'x-correlation-id': correlationId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(expectedVersion === undefined
            ? {}
            : { 'if-match': `"${expectedVersion}"` }),
        },
      });
      lastNetworkError = false;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      lastNetworkError = true;
      if (attempt === 0) continue;
      break;
    }

    redirectIfSessionExpired(response);
    if (attempt === 0 && RETRYABLE_GATEWAY_STATUSES.has(response.status)) {
      continue;
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      try {
        return parseSuccess(payload);
      } catch {
        throw new AdminMutationError(
          'El servei ha retornat una resposta que no es pot validar.',
          502,
          'INVALID_RESPONSE',
          response.headers.get('x-correlation-id') ?? undefined
        );
      }
    }

    try {
      const envelope = parseAdminApiErrorEnvelope(payload);
      throw new AdminMutationError(
        friendlyMutationMessage(response.status, envelope.error.message),
        response.status,
        envelope.error.code,
        envelope.requestId,
        response.headers.get('retry-after') ?? undefined
      );
    } catch (error) {
      if (error instanceof AdminMutationError) throw error;
      throw new AdminMutationError(
        friendlyMutationMessage(
          response.status,
          'No s’ha pogut completar l’operació.'
        ),
        response.status,
        'INVALID_ERROR_RESPONSE',
        response.headers.get('x-correlation-id') ?? undefined,
        response.headers.get('retry-after') ?? undefined
      );
    }
  }

  throw new AdminMutationError(
    friendlyMutationMessage(0, ''),
    0,
    lastNetworkError ? 'NETWORK_ERROR' : 'UPSTREAM_UNAVAILABLE'
  );
}

function parseDeleteEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<DeletePostMutationResult> {
  return parseSuccessEnvelope(value, data => {
    const result = recordValue(data, 'response.data');
    const cleanup = recordValue(result.cleanup, 'response.data.cleanup');
    return {
      postId: stringValue(result.postId, 'response.data.postId'),
      cleanup: {
        pending: booleanValue(cleanup.pending, 'response.data.cleanup.pending'),
        failedCount: integerValue(
          cleanup.failedCount,
          'response.data.cleanup.failedCount'
        ),
        retryWithSameIdempotencyKey: booleanValue(
          cleanup.retryWithSameIdempotencyKey,
          'response.data.cleanup.retryWithSameIdempotencyKey'
        ),
      },
      replayed: booleanValue(result.replayed, 'response.data.replayed'),
    };
  });
}

function parseDetachedImageEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<DetachedImage> {
  return parseSuccessEnvelope(value, data => {
    const result = recordValue(data, 'response.data');
    const cleanup = recordValue(result.cleanup, 'response.data.cleanup');
    const role = stringValue(result.role, 'response.data.role');
    if (role !== 'main' && role !== 'thumb') {
      throw new TypeError('response.data.role is invalid');
    }
    return {
      postId: stringValue(result.postId, 'response.data.postId'),
      postVersion: integerValue(
        result.postVersion,
        'response.data.postVersion'
      ),
      role,
      detached: booleanValue(result.detached, 'response.data.detached'),
      cleanup: {
        pending: booleanValue(cleanup.pending, 'response.data.cleanup.pending'),
        failedCount: integerValue(
          cleanup.failedCount,
          'response.data.cleanup.failedCount'
        ),
        retryWithSameIdempotencyKey: booleanValue(
          cleanup.retryWithSameIdempotencyKey,
          'response.data.cleanup.retryWithSameIdempotencyKey'
        ),
      },
      replayed: booleanValue(result.replayed, 'response.data.replayed'),
    };
  });
}

function parseBulkEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<BulkPublicationResult> {
  return parseSuccessEnvelope(value, data => {
    const result = recordValue(data, 'response.data');
    return {
      publishedCount: integerValue(
        result.publishedCount,
        'response.data.publishedCount'
      ),
      replayed: booleanValue(result.replayed, 'response.data.replayed'),
    };
  });
}

function parsePostImage(value: unknown, path: string): PostImage {
  const image = recordValue(value, path);
  return {
    key: stringValue(image.key, `${path}.key`),
    title: stringValue(image.title, `${path}.title`),
    alt: stringValue(image.alt, `${path}.alt`),
    contentType: stringValue(image.contentType, `${path}.contentType`),
    sizeBytes: integerValue(image.sizeBytes, `${path}.sizeBytes`),
    createdAt: stringValue(image.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(image.updatedAt, `${path}.updatedAt`),
  };
}

function parseImagePreview(value: unknown, path: string): ImagePreview {
  const preview = recordValue(value, path);
  return {
    image: parsePostImage(preview.image, `${path}.image`),
    previewUrl: nullableStringValue(preview.previewUrl, `${path}.previewUrl`),
    previewExpiresAt: nullableStringValue(
      preview.previewExpiresAt,
      `${path}.previewExpiresAt`
    ),
  };
}

function parseMediaInspectionEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<MediaInspection> {
  return parseSuccessEnvelope(value, data => {
    const inspection = recordValue(data, 'response.data');
    const titles = recordValue(inspection.titles, 'response.data.titles');
    const images = recordValue(inspection.images, 'response.data.images');
    return {
      postId: stringValue(inspection.postId, 'response.data.postId'),
      postVersion: integerValue(
        inspection.postVersion,
        'response.data.postVersion'
      ),
      titles: {
        ca: stringValue(titles.ca, 'response.data.titles.ca'),
        en: stringValue(titles.en, 'response.data.titles.en'),
      },
      images: {
        main:
          images.main === null
            ? null
            : parseImagePreview(images.main, 'response.data.images.main'),
        thumb:
          images.thumb === null
            ? null
            : parseImagePreview(images.thumb, 'response.data.images.thumb'),
      },
    };
  });
}

function parsePresignEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<PresignedImageUpload> {
  return parseSuccessEnvelope(value, data => {
    const upload = recordValue(data, 'response.data');
    const headers = recordValue(upload.headers, 'response.data.headers');
    return {
      uploadId: stringValue(upload.uploadId, 'response.data.uploadId'),
      objectKey: stringValue(upload.objectKey, 'response.data.objectKey'),
      uploadUrl: stringValue(upload.uploadUrl, 'response.data.uploadUrl'),
      headers: {
        'content-type': stringValue(
          headers['content-type'],
          'response.data.headers.content-type'
        ) as PresignedImageUpload['headers']['content-type'],
        'x-amz-checksum-sha256': stringValue(
          headers['x-amz-checksum-sha256'],
          'response.data.headers.x-amz-checksum-sha256'
        ),
      },
      expiresAt: stringValue(upload.expiresAt, 'response.data.expiresAt'),
      postVersion: integerValue(
        upload.postVersion,
        'response.data.postVersion'
      ),
    };
  });
}

function parseConfirmedEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<ConfirmedImageUpload> {
  return parseSuccessEnvelope(value, data => {
    const confirmed = recordValue(data, 'response.data');
    const role = stringValue(confirmed.role, 'response.data.role');
    if (role !== 'main' && role !== 'thumb') {
      throw new TypeError('response.data.role is invalid');
    }
    return {
      postId: stringValue(confirmed.postId, 'response.data.postId'),
      postVersion: integerValue(
        confirmed.postVersion,
        'response.data.postVersion'
      ),
      role,
      image: parseImagePreview(confirmed.image, 'response.data.image'),
      cleanupPending: booleanValue(
        confirmed.cleanupPending,
        'response.data.cleanupPending'
      ),
      replayed: booleanValue(confirmed.replayed, 'response.data.replayed'),
    };
  });
}

function generatedId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function retainedId(value: string | undefined, prefix: string): string {
  return value && SAFE_ID_PATTERN.test(value) ? value : generatedId(prefix);
}

function buildTranslation(
  language: PostLanguage,
  stored: StoredPost['translations'][PostLanguage],
  current?: PostTranslation
): PostTranslation {
  return {
    id: retainedId(current?.id, `translation-${language}`),
    title: stored.title,
    content: stored.content,
    slug: stored.slug,
    keywords: stored.keywords.map(value => ({
      id: retainedId(
        current?.keywords.find(keyword => keyword.value === value)?.id,
        `keyword-${language}`
      ),
      value,
    })),
    references: stored.references.map(
      (reference, index): PostReference => ({
        id: retainedId(reference.id, `reference-${language}`),
        type: reference.type,
        reference: reference.reference,
        ...(reference.blockquote ? { blockquote: reference.blockquote } : {}),
        sortOrder: Number.isSafeInteger(reference.sort_order)
          ? reference.sort_order
          : index,
      })
    ),
    translationStatus: 'complete',
  };
}

export function buildAwsPost(
  stored: StoredPost,
  options: {
    categorySlug: string;
    now?: string;
    postId?: string;
    published?: boolean;
  }
): Post {
  const current = stored.aws_post;
  const now = options.now ?? new Date().toISOString();
  return {
    id: current?.id ?? options.postId ?? generatedId('post'),
    category: {
      id: stored.category_id,
      slug: options.categorySlug,
    },
    sortOrder: Number.isSafeInteger(stored.sort_order) ? stored.sort_order : 0,
    published: options.published ?? current?.published ?? stored.is_published,
    date: stored.date,
    author: stored.author,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    translations: {
      ca: buildTranslation(
        'ca',
        stored.translations.ca,
        current?.translations.ca
      ),
      en: buildTranslation(
        'en',
        stored.translations.en,
        current?.translations.en
      ),
    },
    mainImage: current?.mainImage ?? null,
    thumbImage: current?.thumbImage ?? null,
    version: current?.version ?? stored.version ?? 1,
    migration: current?.migration ?? null,
  };
}

export function mutationKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}

export async function createAwsPost(
  post: Post,
  idempotencyKey = mutationKey('post-create'),
  fetchImplementation?: typeof fetch
): Promise<Post> {
  const response = await requestAwsMutation({
    path: '/api/aws/posts',
    method: 'POST',
    body: post,
    idempotencyKey,
    parseSuccess: parsePostDetailEnvelope,
    fetchImplementation,
  });
  return response.data.post;
}

export async function updateAwsPost(
  post: Post,
  expectedVersion: number,
  idempotencyKey = mutationKey('post-update'),
  fetchImplementation?: typeof fetch
): Promise<Post> {
  const response = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(post.id)}`,
    method: 'PUT',
    body: post,
    expectedVersion,
    idempotencyKey,
    parseSuccess: parsePostDetailEnvelope,
    fetchImplementation,
  });
  return response.data.post;
}

export async function setAwsPostPublication(
  postId: string,
  expectedVersion: number,
  published: boolean,
  idempotencyKey = mutationKey(published ? 'post-publish' : 'post-unpublish'),
  fetchImplementation?: typeof fetch
): Promise<Post> {
  const response = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(postId)}/publication`,
    method: 'PUT',
    body: {
      published,
      confirmation: published ? 'PUBLISH' : 'UNPUBLISH',
    },
    expectedVersion,
    idempotencyKey,
    parseSuccess: parsePostDetailEnvelope,
    fetchImplementation,
  });
  return response.data.post;
}

export async function deleteAdminPost(
  backend: AdminDataBackend,
  post: { id: string; version?: number },
  idempotencyKey = mutationKey('post-delete'),
  fetchImplementation?: typeof fetch
): Promise<DeletePostMutationResult> {
  if (backend === 'supabase') {
    const { deletePost } = await import('./posts');
    await deletePost(post.id);
    return {
      postId: post.id,
      cleanup: {
        pending: false,
        failedCount: 0,
        retryWithSameIdempotencyKey: false,
      },
      replayed: false,
    };
  }

  if (!post.version) {
    throw new AdminMutationError(
      'Falta la versió actual de l’article. Recarrega el llistat.',
      409,
      'MISSING_VERSION'
    );
  }
  const response = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(post.id)}`,
    method: 'DELETE',
    expectedVersion: post.version,
    idempotencyKey,
    parseSuccess: parseDeleteEnvelope,
    fetchImplementation,
  });
  return response.data;
}

export async function publishAllAdminPosts(
  backend: AdminDataBackend,
  idempotencyKey = mutationKey('posts-publish-all'),
  fetchImplementation?: typeof fetch
): Promise<BulkPublicationResult> {
  if (backend === 'supabase') {
    const { publishAllPosts } = await import('./posts');
    return {
      publishedCount: await publishAllPosts(),
      replayed: false,
    };
  }
  const response = await requestAwsMutation({
    path: '/api/aws/posts/publication/bulk',
    method: 'POST',
    body: { published: true, confirmation: 'PUBLISH_ALL' },
    idempotencyKey,
    parseSuccess: parseBulkEnvelope,
    fetchImplementation,
  });
  return response.data;
}

export async function countDraftPosts(
  backend: AdminDataBackend,
  signal?: AbortSignal
): Promise<number> {
  if (backend === 'supabase') {
    const { getPosts } = await import('./posts');
    const posts = await getPosts();
    signal?.throwIfAborted();
    return posts.filter(post => !post.is_published).length;
  }

  let cursor: string | undefined;
  let count = 0;
  const seenCursors = new Set<string>();
  do {
    const page = await getAdminPostsPage('aws', {
      limit: AWS_ADMIN_POST_PAGE_LIMIT,
      cursor,
      direction: 'ascending',
      published: false,
      signal,
    });
    count += page.items.length;
    if (count > MAX_BULK_POSTS) {
      throw new AdminMutationError(
        `La publicació massiva està limitada a ${MAX_BULK_POSTS} articles.`,
        409,
        'BULK_LIMIT_EXCEEDED'
      );
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new AdminMutationError(
          'La paginació dels esborranys no és consistent.',
          502,
          'CURSOR_LOOP'
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor);
  return count;
}

export async function countAdminPosts(
  backend: AdminDataBackend,
  signal?: AbortSignal
): Promise<number> {
  if (backend === 'supabase') {
    const { getPostsCount } = await import('./posts');
    const count = await getPostsCount();
    signal?.throwIfAborted();
    return count;
  }

  let cursor: string | undefined;
  let count = 0;
  const seenCursors = new Set<string>();
  do {
    const page = await getAdminPostsPage('aws', {
      limit: AWS_ADMIN_POST_PAGE_LIMIT,
      cursor,
      direction: 'ascending',
      signal,
    });
    count += page.items.length;
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new AdminMutationError(
          'La paginació dels articles no és consistent.',
          502,
          'CURSOR_LOOP'
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor);
  return count;
}

async function checksumSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function xhrPresignedUpload({
  file,
  onProgress,
  signal,
  upload,
}: Parameters<PresignedUploadTransport>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const request = new XMLHttpRequest();
    const handleAbort = () => request.abort();
    request.open('PUT', upload.uploadUrl);
    request.withCredentials = false;
    for (const [name, value] of Object.entries(upload.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = event => {
      const total = event.lengthComputable ? event.total : file.size;
      const loaded = Math.min(event.loaded, total);
      onProgress?.({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
      });
    };
    request.onload = () => {
      signal?.removeEventListener('abort', handleAbort);
      if (request.status >= 200 && request.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        resolve();
        return;
      }
      reject(
        new AdminMutationError(
          `L’emmagatzematge privat ha rebutjat la imatge (${request.status}).`,
          request.status,
          'IMAGE_UPLOAD_FAILED'
        )
      );
    };
    request.onerror = () => {
      signal?.removeEventListener('abort', handleAbort);
      reject(
        new AdminMutationError(
          'La imatge no s’ha pogut pujar. El text desat continua disponible.',
          0,
          'IMAGE_NETWORK_ERROR'
        )
      );
    };
    request.onabort = () => {
      signal?.removeEventListener('abort', handleAbort);
      reject(abortError());
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    onProgress?.({ loaded: 0, total: file.size, percent: 0 });
    request.send(file);
  });
}

function fetchPresignedUpload(
  fetchImplementation: typeof fetch
): PresignedUploadTransport {
  return async ({ file, onProgress, signal, upload }) => {
    onProgress?.({ loaded: 0, total: file.size, percent: 0 });
    let response: Response;
    try {
      response = await fetchImplementation(upload.uploadUrl, {
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: upload.headers,
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new AdminMutationError(
        'La imatge no s’ha pogut pujar. El text desat continua disponible.',
        0,
        'IMAGE_NETWORK_ERROR'
      );
    }
    if (!response.ok) {
      throw new AdminMutationError(
        `L’emmagatzematge privat ha rebutjat la imatge (${response.status}).`,
        response.status,
        'IMAGE_UPLOAD_FAILED'
      );
    }
    onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
  };
}

export async function uploadAwsPostImage(input: {
  alt: string;
  file: File;
  fetchImplementation?: typeof fetch;
  onProgress?: (progress: ImageUploadProgress) => void;
  postId: string;
  postVersion: number;
  role: ImageRole;
  signal?: AbortSignal;
  title: string;
  uploadTransport?: PresignedUploadTransport;
}): Promise<ConfirmedImageUpload> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  input.signal?.throwIfAborted();
  const descriptor = validateUploadDescriptor({
    role: input.role,
    fileName: input.file.name,
    contentType: input.file.type,
    sizeBytes: input.file.size,
    checksumSha256: await checksumSha256(input.file),
    expectedVersion: input.postVersion,
  });
  input.signal?.throwIfAborted();
  const presign = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(input.postId)}/images/presign`,
    method: 'POST',
    body: descriptor,
    idempotencyKey: mutationKey(`image-${input.role}-presign`),
    parseSuccess: parsePresignEnvelope,
    fetchImplementation,
    signal: input.signal,
  });
  input.signal?.throwIfAborted();
  const uploadTransport =
    input.uploadTransport ??
    (input.fetchImplementation
      ? fetchPresignedUpload(fetchImplementation)
      : xhrPresignedUpload);
  await uploadTransport({
    upload: presign.data,
    file: input.file,
    signal: input.signal,
    onProgress: input.onProgress,
  });
  input.signal?.throwIfAborted();
  const confirmed = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(input.postId)}/images/confirm`,
    method: 'POST',
    body: {
      uploadId: presign.data.uploadId,
      title: input.title,
      alt: input.alt,
    },
    idempotencyKey: mutationKey(`image-${input.role}-confirm`),
    parseSuccess: parseConfirmedEnvelope,
    fetchImplementation,
    signal: input.signal,
  });
  return confirmed.data;
}

export async function detachAwsPostImage(input: {
  postId: string;
  postVersion: number;
  role: ImageRole;
  idempotencyKey?: string;
  fetchImplementation?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DetachedImage> {
  const response = await requestAwsMutation({
    path: `/api/aws/posts/${encodeURIComponent(input.postId)}/images/${input.role}`,
    method: 'DELETE',
    expectedVersion: input.postVersion,
    idempotencyKey:
      input.idempotencyKey ?? mutationKey(`image-${input.role}-detach`),
    parseSuccess: parseDetachedImageEnvelope,
    fetchImplementation: input.fetchImplementation,
    signal: input.signal,
  });
  return response.data;
}

export async function getAwsMediaInspection(
  postId: string,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch
): Promise<MediaInspection> {
  let response: Response;
  try {
    response = await fetchImplementation(
      `/api/aws/posts/${encodeURIComponent(postId)}/images`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
        headers: {
          accept: 'application/json',
          'x-correlation-id': crypto.randomUUID(),
        },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AdminMutationError(
      'No s’han pogut carregar les previsualitzacions privades.',
      0,
      'NETWORK_ERROR'
    );
  }
  redirectIfSessionExpired(response);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.ok) {
    try {
      return parseMediaInspectionEnvelope(payload).data;
    } catch {
      throw new AdminMutationError(
        'Les dades de les imatges no es poden validar.',
        502,
        'INVALID_RESPONSE',
        response.headers.get('x-correlation-id') ?? undefined
      );
    }
  }
  try {
    const envelope = parseAdminApiErrorEnvelope(payload);
    throw new AdminMutationError(
      friendlyMutationMessage(response.status, envelope.error.message),
      response.status,
      envelope.error.code,
      envelope.requestId
    );
  } catch (error) {
    if (error instanceof AdminMutationError) throw error;
    throw new AdminMutationError(
      friendlyMutationMessage(
        response.status,
        'No s’han pogut carregar les imatges.'
      ),
      response.status,
      'INVALID_ERROR_RESPONSE',
      response.headers.get('x-correlation-id') ?? undefined
    );
  }
}
