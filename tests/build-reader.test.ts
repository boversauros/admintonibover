import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { createBuildReader } from '../lib/aws/build-reader/handler';
import { InMemoryDynamoDbPort } from '../lib/aws/dynamodb/in-memory-port';
import { DynamoDbPostRepository } from '../lib/aws/dynamodb/post-repository';
import {
  preparePostItems,
  postListItemFromItem,
} from '../lib/aws/dynamodb/post-items';
import type { DynamoItem } from '../lib/aws/dynamodb/port';
import type { Post } from '../lib/domain/posts/types';

const timestamp = '2026-09-24T10:00:00.000Z';

function post(id: string, published = true): Post {
  const translation = (language: 'ca' | 'en') => ({
    id: `${id}-${language}`,
    title: `${language} title`,
    slug: `${id}-${language}`,
    content: 'Body',
    translationStatus: 'complete' as const,
    keywords: [{ id: 'keyword-1', value: 'value' }],
    references: [],
  });
  return {
    id,
    category: { id: 'cat-1', slug: 'category' },
    sortOrder: Number(id.split('-')[1] ?? 1),
    published,
    date: '2026-09-24',
    author: 'Private author',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    migration: null,
    translations: { ca: translation('ca'), en: translation('en') },
    mainImage: null,
    thumbImage: null,
  };
}

function storedPost(value: Post): DynamoItem[] {
  const prepared = preparePostItems(value);
  return [prepared.aggregate, prepared.summary, ...prepared.referenceSegments];
}

function fixture(values: Post[] = [post('post-1')], maxPageSize = 2) {
  const port = new InMemoryDynamoDbPort(
    [
      {
        PK: 'SYSTEM',
        SK: 'REVISION',
        entityType: 'DATA_REVISION',
        schemaVersion: 1,
        revision: 17,
      },
      {
        PK: 'TAXONOMY#CATEGORIES',
        SK: 'CATEGORY#cat-1',
        entityType: 'CATEGORY',
        schemaVersion: 1,
        id: 'cat-1',
        slug: 'category',
        names: { ca: 'Categoria', en: 'Category' },
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        PK: 'TAXONOMY#CATEGORIES',
        SK: 'CATEGORY#empty',
        entityType: 'CATEGORY',
        schemaVersion: 1,
        id: 'empty',
        slug: 'empty',
        names: { ca: 'Buida', en: 'Empty' },
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...['keyword-1', 'keyword-2', 'keyword-3'].map((id, index) => ({
        PK: 'TAXONOMY#KEYWORDS',
        SK: `KEYWORD#${id}`,
        entityType: 'KEYWORD',
        schemaVersion: 1,
        id,
        language: index === 1 ? 'en' : 'ca',
        value: `value-${index}`,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      ...values.flatMap(storedPost),
    ],
    maxPageSize
  );
  const calls: string[] = [];
  let mediaExists = true;
  const reader = createBuildReader({
    environment: 'dev',
    dynamodb: port,
    posts: new DynamoDbPostRepository(port, { queryPageSize: 3 }),
    objects: {
      async head(key) {
        calls.push(`head:${key}`);
        return mediaExists
          ? {
              contentType: 'image/webp',
              sizeBytes: 123,
              checksumSha256: null,
              encryption: null,
            }
          : null;
      },
      async presignDownload(key, seconds) {
        calls.push(`sign:${key}:${seconds}`);
        return {
          url: 'https://signed.example.invalid/image',
          expiresAt: timestamp,
        };
      },
    },
  });
  return {
    reader,
    port,
    calls,
    setMediaExists(value: boolean) {
      mediaExists = value;
    },
  };
}

function request(operation: string, extra: Record<string, unknown> = {}) {
  return { version: 1, environment: 'dev', operation, ...extra };
}

function failure(
  response: Awaited<ReturnType<ReturnType<typeof createBuildReader>>>
) {
  assert.equal(response.ok, false);
  if (response.ok) throw new Error('Expected failure');
  return response.error.code;
}

test('revision and internally paged bilingual catalog use strong reads', async () => {
  const { reader, port } = fixture();
  assert.deepEqual(await reader(request('revision')), {
    version: 1,
    environment: 'dev',
    ok: true,
    data: { revision: 17 },
  });
  const result = await reader(request('catalog'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const catalog = result.data as {
    categories: { id: string }[];
    keywords: { id: string }[];
  };
  assert.deepEqual(
    catalog.categories.map(item => item.id),
    ['cat-1', 'empty']
  );
  assert.deepEqual(
    catalog.keywords.map(item => item.id),
    ['keyword-1', 'keyword-3', 'keyword-2']
  );
  assert.equal(port.requests.scans, 0);
  assert.ok(port.requests.queries >= 3);
});

test('more than 50 posts paginate with published filtering and reject reused cursors', async () => {
  const values = Array.from({ length: 56 }, (_, index) =>
    post(`post-${index + 1}`)
  );
  values.push(post('draft-99', false));
  const { reader, port } = fixture(values, 4);
  const first = await reader(request('posts', { limit: 50 }));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const page1 = first.data as {
    items: { id: string; version: number }[];
    nextCursor: string | null;
  };
  assert.equal(page1.items.length, 50);
  assert.ok(page1.nextCursor);
  const second = await reader(
    request('posts', { limit: 50, cursor: page1.nextCursor })
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const page2 = second.data as typeof page1;
  assert.equal(page2.items.length, 6);
  assert.equal(page2.nextCursor, null);
  assert.equal(
    new Set([...page1.items, ...page2.items].map(item => item.id)).size,
    56
  );
  assert.equal(port.requests.scans, 0);
  assert.equal(
    failure(
      await reader(request('posts', { limit: 50, cursor: 'bad-cursor' }))
    ),
    'INVALID_CURSOR'
  );
  assert.equal(
    failure(
      await reader(
        request('posts', { limit: 50, cursor: page1.nextCursor + '$' })
      )
    ),
    'INVALID_CURSOR'
  );
});

test('published detail rebuilds segmented references, projects fields, and enforces version', async () => {
  const value = post('post-1');
  value.translations.ca.references = Array.from(
    { length: 200 },
    (_, index) => ({
      id: `reference-${index}`,
      type: 'text',
      reference: `Reference ${index} ${'x'.repeat(1750)}`,
      blockquote: 'Quotation',
      sortOrder: index,
    })
  );
  const prepared = preparePostItems(value);
  assert.equal(prepared.aggregate.referenceStorage, 'segmented');
  const { reader } = fixture([value], 1);
  const result = await reader(
    request('post', { id: 'post-1', expectedVersion: 1 })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const projected = result.data as {
    translations: { ca: { references: unknown[] } };
    author?: string;
    mainImage: null;
  };
  assert.equal(projected.translations.ca.references.length, 200);
  assert.equal(projected.author, undefined);
  assert.equal(projected.mainImage, null);
  assert.equal(
    failure(
      await reader(request('post', { id: 'post-1', expectedVersion: 2 }))
    ),
    'VERSION_CONFLICT'
  );
  assert.equal(
    failure(
      await reader(request('post', { id: 'missing', expectedVersion: 1 }))
    ),
    'NOT_FOUND'
  );
});

test('drafts, arbitrary image keys, missing media, and version changes grant nothing', async () => {
  const live = post('post-1');
  live.mainImage = {
    key: 'images/posts/post-1/main/photo.webp',
    title: 'Main',
    alt: 'Alt',
    contentType: 'image/webp',
    sizeBytes: 123,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const arbitrary = post('post-2');
  arbitrary.mainImage = { ...live.mainImage, key: 'backups/private.webp' };
  const { reader, calls, setMediaExists } = fixture([
    live,
    arbitrary,
    post('draft-3', false),
  ]);
  assert.equal(
    failure(
      await reader(request('post', { id: 'draft-3', expectedVersion: 1 }))
    ),
    'NOT_FOUND'
  );
  assert.equal(
    failure(
      await reader(
        request('media', {
          postId: 'draft-3',
          role: 'main',
          expectedVersion: 1,
        })
      )
    ),
    'NOT_FOUND'
  );
  assert.equal(
    failure(
      await reader(
        request('media', { postId: 'post-2', role: 'main', expectedVersion: 1 })
      )
    ),
    'DATA_INTEGRITY'
  );
  assert.equal(
    failure(
      await reader(
        request('media', {
          postId: 'post-1',
          role: 'thumb',
          expectedVersion: 1,
        })
      )
    ),
    'MEDIA_NOT_ATTACHED'
  );
  assert.equal(
    failure(
      await reader(
        request('media', { postId: 'post-1', role: 'main', expectedVersion: 2 })
      )
    ),
    'VERSION_CONFLICT'
  );
  assert.deepEqual(calls, []);
  setMediaExists(false);
  assert.equal(
    failure(
      await reader(
        request('media', { postId: 'post-1', role: 'main', expectedVersion: 1 })
      )
    ),
    'MEDIA_UNAVAILABLE'
  );
  setMediaExists(true);
  const granted = await reader(
    request('media', { postId: 'post-1', role: 'main', expectedVersion: 1 })
  );
  assert.equal(granted.ok, true);
  assert.deepEqual(calls.slice(-2), [
    'head:images/posts/post-1/main/photo.webp',
    'sign:images/posts/post-1/main/photo.webp:300',
  ]);
});

test('request boundary and missing revision fail with stable content-free errors', async () => {
  const { reader } = fixture();
  for (const invalid of [
    null,
    {},
    request('unknown'),
    request('posts', { limit: 51 }),
    request('post', { id: '../draft', expectedVersion: 1 }),
    request('revision', { published: false }),
    { ...request('revision'), environment: 'prod' },
    'x'.repeat(9000),
  ]) {
    const response = await reader(invalid);
    assert.equal(failure(response), 'INVALID_REQUEST');
    assert.equal(JSON.stringify(response).includes('Private author'), false);
  }
  const emptyPort = new InMemoryDynamoDbPort();
  const missing = createBuildReader({
    environment: 'dev',
    dynamodb: emptyPort,
    posts: new DynamoDbPostRepository(emptyPort),
    objects: {
      async head() {
        return null;
      },
      async presignDownload() {
        throw new Error('unused');
      },
    },
  });
  assert.equal(
    failure(await missing(request('revision'))),
    'DATA_UNINITIALIZED'
  );
});

test('a missing aggregate and a repeated page cursor fail closed', async () => {
  const summary = preparePostItems(post('post-1')).summary;
  const port = new InMemoryDynamoDbPort([summary]);
  const reader = createBuildReader({
    environment: 'dev',
    dynamodb: port,
    posts: new DynamoDbPostRepository(port),
    objects: {
      async head() {
        return null;
      },
      async presignDownload() {
        throw new Error('unused');
      },
    },
  });
  assert.equal(
    failure(
      await reader(request('post', { id: 'post-1', expectedVersion: 1 }))
    ),
    'NOT_FOUND'
  );

  const cursor = Buffer.from(
    JSON.stringify({
      version: 1,
      environment: 'dev',
      operation: 'posts',
      cursor: 'opaque',
    })
  ).toString('base64url');
  const repeated = createBuildReader({
    environment: 'dev',
    dynamodb: port,
    posts: {
      async list() {
        return { items: [postListItemFromItem(summary)], nextCursor: 'opaque' };
      },
      async getById() {
        return null;
      },
    },
    objects: {
      async head() {
        return null;
      },
      async presignDownload() {
        throw new Error('unused');
      },
    },
  });
  assert.equal(
    failure(await repeated(request('posts', { limit: 1, cursor }))),
    'INVALID_CURSOR'
  );
});

test('the packaged Lambda uses the same strict request boundary', async () => {
  process.env.READER_ENVIRONMENT = 'dev';
  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  process.env.CONTENT_BUCKET_NAME = 'fixture-bucket';
  const bundled = createRequire(import.meta.url)(
    '../infra/generated/build-reader-lambda.cjs'
  ) as {
    handler: (input: unknown) => Promise<unknown>;
  };
  assert.deepEqual(await bundled.handler(null), {
    version: 1,
    environment: 'dev',
    ok: false,
    error: { code: 'INVALID_REQUEST', retryable: false },
  });
});

test('catalog rejects malformed records and stops before an oversized response', async () => {
  const badPort = new InMemoryDynamoDbPort([
    {
      PK: 'TAXONOMY#CATEGORIES',
      SK: 'CATEGORY#broken',
      entityType: 'CATEGORY',
      schemaVersion: 1,
      id: 'broken',
      slug: 'broken',
      names: { ca: 'Nom' },
    },
  ]);
  const emptyPosts = {
    async list() {
      return { items: [], nextCursor: null };
    },
    async getById() {
      return null;
    },
  };
  const noObjects = {
    async head() {
      return null;
    },
    async presignDownload() {
      throw new Error('unused');
    },
  };
  const malformed = createBuildReader({
    environment: 'dev',
    dynamodb: badPort,
    posts: emptyPosts,
    objects: noObjects,
  });
  assert.equal(failure(await malformed(request('catalog'))), 'DATA_INTEGRITY');

  let queries = 0;
  const large = createBuildReader({
    environment: 'dev',
    posts: emptyPosts,
    objects: noObjects,
    dynamodb: {
      async get() {
        return null;
      },
      async query(input) {
        if (input.partitionKey === 'TAXONOMY#KEYWORDS') return { items: [] };
        const page = queries++;
        return {
          items: Array.from({ length: 50 }, (_, index) => ({
            PK: input.partitionKey,
            SK: `CATEGORY#${page}-${index}`,
            entityType: 'CATEGORY',
            schemaVersion: 1,
            id: `category-${page}-${index}`,
            slug: 'category',
            names: { ca: 'x'.repeat(6000), en: 'Name' },
          })),
          lastEvaluatedKey: {
            PK: input.partitionKey,
            SK: `CATEGORY#${page}-49`,
          },
        };
      },
    },
  });
  assert.equal(failure(await large(request('catalog'))), 'RESULT_TOO_LARGE');
  assert.ok(queries < 30);
});
