import type { ListPostsOptions } from '@/lib/domain/posts/repository';

import {
  ADMIN_API_VERSION,
  type AdminApiErrorEnvelope,
  type AdminApiSuccessEnvelope,
  type AdminCategoryRead,
  type AdminKeywordRead,
  type AdminPostListPage,
  parseAdminApiErrorEnvelope,
  parseCategoriesEnvelope,
  parseKeywordsEnvelope,
  parsePostDetailEnvelope,
  parsePostListEnvelope,
} from './admin-read-contract';

const READ_TIMEOUT_MS = 8_000;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

type SuccessParser<T> = (value: unknown) => AdminApiSuccessEnvelope<T>;

export type AdminApiClientResult<T> =
  | {
      ok: true;
      status: number;
      envelope: AdminApiSuccessEnvelope<T>;
      correlationId: string;
      etag?: string;
    }
  | {
      ok: false;
      status: number;
      envelope: AdminApiErrorEnvelope;
      correlationId: string;
      retryAfter?: string;
    };

export type AdminApiClientOptions = {
  accessToken: string;
  apiUrl: string;
  correlationId: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
};

function safeCorrelationId(value: string | null, fallback: string): string {
  return value && CORRELATION_ID_PATTERN.test(value) ? value : fallback;
}

function errorEnvelope(
  status: number,
  requestId: string,
  code?: string,
  message?: string
): AdminApiErrorEnvelope {
  const fallback = (() => {
    if (status === 400) return ['BAD_REQUEST', 'The read request is invalid'];
    if (status === 401) return ['UNAUTHORIZED', 'Sign-in required'];
    if (status === 403) return ['FORBIDDEN', 'Access denied'];
    if (status === 404)
      return ['NOT_FOUND', 'The requested data was not found'];
    if (status === 409)
      return ['CONFLICT', 'The data changed while it was loading'];
    if (status === 429)
      return ['THROTTLED', 'Too many requests; retry shortly'];
    if (status === 504)
      return ['UPSTREAM_TIMEOUT', 'The AWS admin API timed out'];
    if (status >= 500) {
      return ['UPSTREAM_UNAVAILABLE', 'The AWS admin API is unavailable'];
    }
    return ['UPSTREAM_ERROR', 'The AWS admin read could not be completed'];
  })();
  return {
    version: ADMIN_API_VERSION,
    error: {
      code: code ?? fallback[0],
      message: message ?? fallback[1],
    },
    requestId,
  };
}

function safeStatus(status: number): number {
  return [400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504].includes(
    status
  )
    ? status
    : 502;
}

export class AdminApiClient {
  private readonly accessToken: string;
  private readonly apiUrl: string;
  private readonly correlationId: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  constructor({
    accessToken,
    apiUrl,
    correlationId,
    fetchImplementation = fetch,
    timeoutMs = READ_TIMEOUT_MS,
  }: AdminApiClientOptions) {
    this.accessToken = accessToken;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.correlationId = correlationId;
    this.fetchImplementation = fetchImplementation;
    this.timeoutMs = timeoutMs;
  }

  listPosts(
    options: ListPostsOptions
  ): Promise<AdminApiClientResult<AdminPostListPage>> {
    const query = new URLSearchParams({ limit: String(options.limit) });
    if (options.cursor) query.set('cursor', options.cursor);
    if (options.direction) query.set('direction', options.direction);
    if (options.title) query.set('title', options.title);
    if (options.published !== undefined) {
      query.set('published', String(options.published));
    }
    if (options.categoryId) query.set('categoryId', options.categoryId);
    if (options.imageStatus) query.set('imageStatus', options.imageStatus);
    return this.request(`posts?${query.toString()}`, parsePostListEnvelope);
  }

  getPost(
    postId: string
  ): Promise<
    AdminApiClientResult<ReturnType<typeof parsePostDetailEnvelope>['data']>
  > {
    return this.request(
      `posts/${encodeURIComponent(postId)}`,
      parsePostDetailEnvelope
    );
  }

  listCategories(): Promise<
    AdminApiClientResult<{ items: AdminCategoryRead[] }>
  > {
    return this.request('categories', parseCategoriesEnvelope);
  }

  listKeywords(
    language?: 'ca' | 'en'
  ): Promise<AdminApiClientResult<{ items: AdminKeywordRead[] }>> {
    const path = language
      ? `keywords?${new URLSearchParams({ language }).toString()}`
      : 'keywords';
    return this.request(path, parseKeywordsEnvelope);
  }

  private async request<T>(
    path: string,
    parseSuccess: SuccessParser<T>
  ): Promise<AdminApiClientResult<T>> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.apiUrl}/${path}`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.accessToken}`,
          'x-correlation-id': this.correlationId,
        },
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      const status = timedOut ? 504 : 502;
      return {
        ok: false,
        status,
        envelope: errorEnvelope(status, this.correlationId),
        correlationId: this.correlationId,
      };
    }

    const responseCorrelationId = safeCorrelationId(
      response.headers.get('x-correlation-id'),
      this.correlationId
    );
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      try {
        const envelope = parseSuccess(payload);
        return {
          ok: true,
          status: response.status,
          envelope,
          correlationId: safeCorrelationId(
            envelope.requestId,
            responseCorrelationId
          ),
          ...(response.headers.get('etag')
            ? { etag: response.headers.get('etag') ?? undefined }
            : {}),
        };
      } catch {
        return {
          ok: false,
          status: 502,
          envelope: errorEnvelope(
            502,
            responseCorrelationId,
            'INVALID_UPSTREAM_RESPONSE',
            'The AWS admin API returned an invalid response'
          ),
          correlationId: responseCorrelationId,
        };
      }
    }

    const status = safeStatus(response.status);
    let envelope: AdminApiErrorEnvelope;
    try {
      envelope = parseAdminApiErrorEnvelope(payload);
    } catch {
      envelope = errorEnvelope(status, responseCorrelationId);
    }
    const correlationId = safeCorrelationId(
      envelope.requestId,
      responseCorrelationId
    );
    return {
      ok: false,
      status,
      envelope: { ...envelope, requestId: correlationId },
      correlationId,
      ...(response.headers.get('retry-after')
        ? { retryAfter: response.headers.get('retry-after') ?? undefined }
        : {}),
    };
  }
}
