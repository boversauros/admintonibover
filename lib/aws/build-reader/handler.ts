import {
  PostDataIntegrityError,
  PostValidationError,
} from '@/lib/domain/posts/errors';
import type { Post, PostImage } from '@/lib/domain/posts/types';
import { assertValidPost } from '@/lib/domain/posts/validation';
import type { PostRepository } from '@/lib/domain/posts/repository';
import type {
  DynamoDbPort,
  DynamoItem,
  DynamoKey,
} from '@/lib/aws/dynamodb/port';
import type { MediaObjectStore } from '@/lib/aws/media/object-store';

type Environment = 'dev' | 'prod';
type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'MEDIA_NOT_ATTACHED'
  | 'MEDIA_UNAVAILABLE'
  | 'DATA_UNINITIALIZED'
  | 'DATA_INTEGRITY'
  | 'RESULT_TOO_LARGE'
  | 'THROTTLED'
  | 'UNAVAILABLE';
type Request =
  | { version: 1; environment: Environment; operation: 'revision' | 'catalog' }
  | {
      version: 1;
      environment: Environment;
      operation: 'posts';
      limit: number;
      cursor?: string;
    }
  | {
      version: 1;
      environment: Environment;
      operation: 'post';
      id: string;
      expectedVersion: number;
    }
  | {
      version: 1;
      environment: Environment;
      operation: 'media';
      postId: string;
      role: 'main' | 'thumb';
      expectedVersion: number;
    };

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;

class ReaderError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = []
): boolean {
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      key => required.includes(key) || optional.includes(key)
    )
  );
}

function positiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseRequest(input: unknown, environment: Environment): Request {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  } catch {
    throw new ReaderError('INVALID_REQUEST');
  }
  if (
    bytes > MAX_REQUEST_BYTES ||
    !record(input) ||
    input.version !== 1 ||
    input.environment !== environment ||
    typeof input.operation !== 'string'
  ) {
    throw new ReaderError('INVALID_REQUEST');
  }
  const base = ['version', 'environment', 'operation'];
  if (input.operation === 'revision' || input.operation === 'catalog') {
    if (!exactKeys(input, base)) throw new ReaderError('INVALID_REQUEST');
    return input as Request;
  }
  if (input.operation === 'posts') {
    if (
      !exactKeys(input, [...base, 'limit'], ['cursor']) ||
      !Number.isSafeInteger(input.limit) ||
      (input.limit as number) < 1 ||
      (input.limit as number) > 50
    ) {
      throw new ReaderError('INVALID_REQUEST');
    }
    if (
      Object.hasOwn(input, 'cursor') &&
      (typeof input.cursor !== 'string' || !CURSOR.test(input.cursor))
    ) {
      throw new ReaderError('INVALID_CURSOR');
    }
    return input as Request;
  }
  if (input.operation === 'post') {
    if (
      !exactKeys(input, [...base, 'id', 'expectedVersion']) ||
      typeof input.id !== 'string' ||
      !ID.test(input.id) ||
      !positiveVersion(input.expectedVersion)
    ) {
      throw new ReaderError('INVALID_REQUEST');
    }
    return input as Request;
  }
  if (input.operation === 'media') {
    if (
      !exactKeys(input, [...base, 'postId', 'role', 'expectedVersion']) ||
      typeof input.postId !== 'string' ||
      !ID.test(input.postId) ||
      (input.role !== 'main' && input.role !== 'thumb') ||
      !positiveVersion(input.expectedVersion)
    ) {
      throw new ReaderError('INVALID_REQUEST');
    }
    return input as Request;
  }
  throw new ReaderError('INVALID_REQUEST');
}

function decodeCursor(value: string, environment: Environment): string {
  try {
    const json = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(json, 'utf8').toString('base64url') !== value)
      throw new Error();
    const payload: unknown = JSON.parse(json);
    if (
      !record(payload) ||
      !exactKeys(payload, ['version', 'environment', 'operation', 'cursor']) ||
      payload.version !== 1 ||
      payload.environment !== environment ||
      payload.operation !== 'posts' ||
      typeof payload.cursor !== 'string' ||
      !CURSOR.test(payload.cursor)
    )
      throw new Error();
    return payload.cursor;
  } catch {
    throw new ReaderError('INVALID_CURSOR');
  }
}

function encodeCursor(value: string, environment: Environment): string {
  const result = Buffer.from(
    JSON.stringify({
      version: 1,
      environment,
      operation: 'posts',
      cursor: value,
    })
  ).toString('base64url');
  if (result.length > 2048) throw new ReaderError('RESULT_TOO_LARGE');
  return result;
}

function imageDescriptor(image: PostImage | null) {
  return image === null
    ? null
    : {
        title: image.title,
        alt: image.alt,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
      };
}

function publishedProjection(post: Post) {
  const translation = (language: 'ca' | 'en') => {
    const item = post.translations[language];
    return {
      id: item.id,
      title: item.title,
      slug: item.slug,
      content: item.content,
      translationStatus: item.translationStatus,
      keywords: item.keywords.map(({ id, value }) => ({ id, value })),
      references: item.references.map(
        ({ id, type, reference, blockquote, sortOrder }) => ({
          id,
          type,
          reference,
          ...(blockquote === undefined ? {} : { blockquote }),
          sortOrder,
        })
      ),
    };
  };
  return {
    id: post.id,
    version: post.version,
    published: true as const,
    category: { id: post.category.id, slug: post.category.slug },
    sortOrder: post.sortOrder,
    date: post.date,
    translations: { ca: translation('ca'), en: translation('en') },
    mainImage: imageDescriptor(post.mainImage),
    thumbImage: imageDescriptor(post.thumbImage),
  };
}

export type ReaderDependencies = {
  environment: Environment;
  dynamodb: Pick<DynamoDbPort, 'get' | 'query'>;
  posts: Pick<PostRepository, 'list' | 'getById'>;
  objects: Pick<MediaObjectStore, 'head' | 'presignDownload'>;
};

function category(item: DynamoItem) {
  const names = item.names;
  if (
    item.entityType !== 'CATEGORY' ||
    item.schemaVersion !== 1 ||
    typeof item.id !== 'string' ||
    !ID.test(item.id) ||
    typeof item.slug !== 'string' ||
    item.slug.length === 0 ||
    !record(names) ||
    typeof names.ca !== 'string' ||
    names.ca.length === 0 ||
    typeof names.en !== 'string' ||
    names.en.length === 0
  ) {
    throw new ReaderError('DATA_INTEGRITY');
  }
  return {
    id: item.id,
    slug: item.slug,
    names: { ca: names.ca, en: names.en },
  };
}

function keyword(item: DynamoItem) {
  if (
    item.entityType !== 'KEYWORD' ||
    item.schemaVersion !== 1 ||
    typeof item.id !== 'string' ||
    !ID.test(item.id) ||
    (item.language !== 'ca' && item.language !== 'en') ||
    typeof item.value !== 'string' ||
    item.value.length === 0
  ) {
    throw new ReaderError('DATA_INTEGRITY');
  }
  return { id: item.id, language: item.language, value: item.value };
}

async function catalogPartition<T extends { id: string }>(
  dynamodb: Pick<DynamoDbPort, 'query'>,
  partitionKey: string,
  project: (item: DynamoItem) => T
): Promise<T[]> {
  const results: T[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  let bytes = 0;
  let exclusiveStartKey: DynamoKey | undefined;
  do {
    const page = await dynamodb.query({
      partitionKey,
      consistentRead: true,
      scanIndexForward: true,
      exclusiveStartKey,
      limit: 50,
    });
    for (const item of page.items) {
      const projected = project(item);
      const id = projected.id;
      if (seenIds.has(id)) throw new ReaderError('DATA_INTEGRITY');
      seenIds.add(id);
      bytes += Buffer.byteLength(JSON.stringify(projected), 'utf8') + 1;
      if (bytes > MAX_RESPONSE_BYTES) throw new ReaderError('RESULT_TOO_LARGE');
      results.push(projected);
    }
    exclusiveStartKey = page.lastEvaluatedKey;
    if (exclusiveStartKey) {
      const marker = `${exclusiveStartKey.PK}\u0000${exclusiveStartKey.SK}`;
      if (
        exclusiveStartKey.PK !== partitionKey ||
        seenKeys.has(marker) ||
        page.items.length === 0
      ) {
        throw new ReaderError('DATA_INTEGRITY');
      }
      seenKeys.add(marker);
    }
  } while (exclusiveStartKey);
  return results;
}

function errorCode(error: unknown): ErrorCode {
  if (error instanceof ReaderError) return error.code;
  if (error instanceof PostDataIntegrityError || error instanceof TypeError)
    return 'DATA_INTEGRITY';
  if (error instanceof PostValidationError)
    return error.issues.some(issue => issue.code === 'INVALID_CURSOR')
      ? 'INVALID_CURSOR'
      : 'DATA_INTEGRITY';
  if (
    record(error) &&
    (error.name === 'ThrottlingException' ||
      error.name === 'ProvisionedThroughputExceededException' ||
      error.name === 'TooManyRequestsException')
  )
    return 'THROTTLED';
  return 'UNAVAILABLE';
}

export function createBuildReader(deps: ReaderDependencies) {
  const { environment, dynamodb, posts, objects } = deps;
  async function publishedPost(
    id: string,
    expectedVersion: number
  ): Promise<Post> {
    const post = await posts.getById(id);
    if (!post || !post.published) throw new ReaderError('NOT_FOUND');
    assertValidPost(post);
    if (post.version !== expectedVersion)
      throw new ReaderError('VERSION_CONFLICT');
    return post;
  }

  return async (input: unknown) => {
    try {
      const request = parseRequest(input, environment);
      let data: unknown;
      switch (request.operation) {
        case 'revision': {
          const item = await dynamodb.get(
            { PK: 'SYSTEM', SK: 'REVISION' },
            true
          );
          if (!item) throw new ReaderError('DATA_UNINITIALIZED');
          if (
            item.entityType !== 'DATA_REVISION' ||
            item.schemaVersion !== 1 ||
            !Number.isSafeInteger(item.revision) ||
            (item.revision as number) < 0
          ) {
            throw new ReaderError('DATA_INTEGRITY');
          }
          data = { revision: item.revision };
          break;
        }
        case 'catalog': {
          const [categories, keywords] = await Promise.all([
            catalogPartition(dynamodb, 'TAXONOMY#CATEGORIES', category),
            catalogPartition(dynamodb, 'TAXONOMY#KEYWORDS', keyword),
          ]);
          data = {
            categories: categories
              .map(({ id, slug, names }) => ({ id, slug, names }))
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
            keywords: keywords
              .map(({ id, language, value }) => ({ id, language, value }))
              .sort((a, b) =>
                a.language < b.language
                  ? -1
                  : a.language > b.language
                    ? 1
                    : a.value < b.value
                      ? -1
                      : a.value > b.value
                        ? 1
                        : a.id < b.id
                          ? -1
                          : a.id > b.id
                            ? 1
                            : 0
              ),
          };
          break;
        }
        case 'posts': {
          const cursor =
            request.cursor === undefined
              ? undefined
              : decodeCursor(request.cursor, environment);
          const page = await posts.list({
            published: true,
            direction: 'descending',
            limit: request.limit,
            cursor,
          });
          if (!Array.isArray(page.items) || page.items.length > request.limit)
            throw new ReaderError('DATA_INTEGRITY');
          const seen = new Set<string>();
          const items = page.items.map(item => {
            if (
              !item.published ||
              !ID.test(item.id) ||
              !positiveVersion(item.version) ||
              seen.has(item.id)
            )
              throw new ReaderError('DATA_INTEGRITY');
            seen.add(item.id);
            return { id: item.id, version: item.version };
          });
          if (page.nextCursor !== null && items.length === 0)
            throw new ReaderError('INVALID_CURSOR');
          if (
            page.nextCursor !== null &&
            (typeof page.nextCursor !== 'string' || page.nextCursor === cursor)
          )
            throw new ReaderError('INVALID_CURSOR');
          data = {
            items,
            nextCursor:
              page.nextCursor === null
                ? null
                : encodeCursor(page.nextCursor, environment),
          };
          break;
        }
        case 'post':
          data = publishedProjection(
            await publishedPost(request.id, request.expectedVersion)
          );
          break;
        case 'media': {
          const post = await publishedPost(
            request.postId,
            request.expectedVersion
          );
          const image =
            request.role === 'main' ? post.mainImage : post.thumbImage;
          if (!image) throw new ReaderError('MEDIA_NOT_ATTACHED');
          if (
            !image.key.startsWith(`images/posts/${post.id}/${request.role}/`) ||
            image.key === `images/posts/${post.id}/${request.role}/` ||
            image.key.includes('..')
          ) {
            throw new ReaderError('DATA_INTEGRITY');
          }
          const metadata = await objects.head(image.key);
          if (
            !metadata ||
            metadata.contentType !== image.contentType ||
            metadata.sizeBytes !== image.sizeBytes
          ) {
            throw new ReaderError('MEDIA_UNAVAILABLE');
          }
          const grant = await objects.presignDownload(image.key, 300);
          data = {
            url: grant.url,
            expiresAt: grant.expiresAt,
            contentType: image.contentType,
            sizeBytes: image.sizeBytes,
          };
          break;
        }
      }
      const response = {
        version: 1 as const,
        environment,
        ok: true as const,
        data,
      };
      if (
        Buffer.byteLength(JSON.stringify(response), 'utf8') > MAX_RESPONSE_BYTES
      )
        throw new ReaderError('RESULT_TOO_LARGE');
      return response;
    } catch (error) {
      const code = errorCode(error);
      return {
        version: 1 as const,
        environment,
        ok: false as const,
        error: {
          code,
          retryable: code === 'THROTTLED' || code === 'UNAVAILABLE',
        },
      };
    }
  };
}
