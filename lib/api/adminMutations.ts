'use client';

import { redirectIfSessionExpired } from '@/lib/auth/client-session';
import type {
  ConfirmedImageUpload,
  DetachedImage,
  ImageRole,
  MediaInspection,
  PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import { validateUploadDescriptor } from '@/lib/domain/media/validation';
import type { Post } from '@/lib/domain/posts/types';

import {
  parseAdminApiErrorEnvelope,
  parseBulkEnvelope,
  parseConfirmedEnvelope,
  parseDeleteEnvelope,
  parseDetachedImageEnvelope,
  parseMediaInspectionEnvelope,
  parsePostDetailEnvelope,
  parsePresignEnvelope,
  type AdminApiSuccessEnvelope,
  type BulkPublicationResult,
  type DeletePostMutationResult,
  type EnvelopeParser,
} from './adminContract';
import { AWS_ADMIN_POST_PAGE_LIMIT, getAdminPostsPage } from './adminReads';
import { reportSiteRebuild } from './siteRebuild';

const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504]);
const MAX_BULK_POSTS = 100;

type AwsMutationMethod = 'POST' | 'PUT' | 'DELETE';

type MutationRequest<T> = {
  body?: unknown;
  expectedVersion?: number;
  fetchImplementation?: typeof fetch;
  idempotencyKey: string;
  method: AwsMutationMethod;
  parseSuccess: EnvelopeParser<T>;
  path: string;
  /** Set to false when repeating the request could not be recognised. */
  retry?: boolean;
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

function friendlyMutationMessage(
  status: number,
  fallback: string,
  code?: string
): string {
  if (status === 0) {
    return 'No s’ha pogut contactar amb el servei. Torna-ho a provar.';
  }
  if (status === 400 || status === 413 || status === 415) return fallback;
  if (status === 401) return 'La sessió ha caducat. Torna a iniciar sessió.';
  if (status === 403) return 'No tens permisos per fer aquesta operació.';
  if (status === 404) return 'L’article ja no existeix.';
  if (status === 409) {
    if (code === 'BULK_COUNT_MISMATCH') {
      return 'El nombre d’esborranys ha canviat. Torna a obrir la confirmació amb el recompte actual.';
    }
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
  retry = true,
  signal,
}: MutationRequest<T>): Promise<AdminApiSuccessEnvelope<T>> {
  const correlationId = crypto.randomUUID();
  const attempts = retry ? 2 : 1;
  let lastNetworkError = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
      continue;
    }

    redirectIfSessionExpired(response);
    if (
      attempt + 1 < attempts &&
      RETRYABLE_GATEWAY_STATUSES.has(response.status)
    ) {
      continue;
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      reportSiteRebuild(response);
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
        friendlyMutationMessage(
          response.status,
          envelope.error.message,
          envelope.error.code
        ),
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

export function mutationKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}

export function isExactBulkConfirmation(
  value: string,
  expectedCount: number
): boolean {
  return value.trim() === String(expectedCount);
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
  post: { id: string; version?: number },
  idempotencyKey = mutationKey('post-delete'),
  fetchImplementation?: typeof fetch
): Promise<DeletePostMutationResult> {
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
  expectedCount: number,
  idempotencyKey = mutationKey('posts-publish-all'),
  fetchImplementation?: typeof fetch
): Promise<BulkPublicationResult> {
  const response = await requestAwsMutation({
    path: '/api/aws/posts/publication/bulk',
    method: 'POST',
    body: { published: true, confirmation: 'PUBLISH_ALL', expectedCount },
    idempotencyKey,
    parseSuccess: parseBulkEnvelope,
    fetchImplementation,
    // An interrupted run may have published some posts, so the count it was
    // confirmed with no longer holds. The user confirms the remainder instead.
    retry: false,
  });
  return response.data;
}

export async function countDraftPosts(signal?: AbortSignal): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  const seenCursors = new Set<string>();
  do {
    const page = await getAdminPostsPage({
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

export async function countAdminPosts(signal?: AbortSignal): Promise<number> {
  let cursor: string | undefined;
  let count = 0;
  const seenCursors = new Set<string>();
  do {
    const page = await getAdminPostsPage({
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
      friendlyMutationMessage(
        response.status,
        envelope.error.message,
        envelope.error.code
      ),
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
