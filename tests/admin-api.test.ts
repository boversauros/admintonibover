import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminApiHandler,
  type AdminApiDependencies,
  type AdminApiEvent,
  type AdminApiResponse,
} from '../lib/aws/admin-api/handler';
import { validateDynamoDbBackup } from '../lib/aws/admin-api/backup';
import { DynamoDbAdminStore } from '../lib/aws/admin-api/store';
import { InMemoryDynamoDbPort } from '../lib/aws/dynamodb/in-memory-port';
import { DynamoDbPostRepository } from '../lib/aws/dynamodb/post-repository';
import type { Post, PostImage } from '../lib/domain/posts/types';

const NOW = '2026-08-12T10:00:00.000Z';
const SECURITY = {
  issuer: 'https://issuer.example.invalid/pool',
  clientId: 'admin-client',
  adminScope: 'admintonibover-api/admin',
};

function image(role: 'main' | 'thumb'): PostImage {
  const digest = role === 'main' ? 'a'.repeat(64) : 'b'.repeat(64);
  return {
    key: `images/posts/post-delete/${role}/${digest}.webp`,
    title: `${role} title`,
    alt: `${role} alt`,
    contentType: 'image/webp',
    sizeBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function postFixture(
  id: string,
  options: { published?: boolean; images?: boolean; categoryId?: string } = {}
): Post {
  const categoryId = options.categoryId ?? 'category-1';
  return {
    id,
    category: { id: categoryId, slug: `slug-${categoryId}` },
    sortOrder: Number(id.match(/\d+/)?.[0] ?? 1),
    published: options.published ?? false,
    date: '2026-08-12',
    author: 'Fixture Author',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: {
        id: `${id}-translation-ca`,
        title: `Títol ${id}`,
        content: `Contingut complet per ${id}`,
        slug: `${id}-ca`,
        keywords: [{ id: `${id}-keyword-ca`, value: 'prova' }],
        references: [],
        translationStatus: 'complete',
      },
      en: {
        id: `${id}-translation-en`,
        title: `Title ${id}`,
        content: `Complete content for ${id}`,
        slug: `${id}-en`,
        keywords: [{ id: `${id}-keyword-en`, value: 'test' }],
        references: [],
        translationStatus: 'complete',
      },
    },
    mainImage: options.images ? image('main') : null,
    thumbImage: options.images ? image('thumb') : null,
    version: 1,
    migration: null,
  };
}

function event(
  routeKey: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    id?: string;
    role?: 'main' | 'thumb';
    query?: Record<string, string>;
    claims?: Record<string, unknown> | null;
  } = {}
): AdminApiEvent {
  const claims =
    options.claims === undefined
      ? {
          iss: SECURITY.issuer,
          client_id: SECURITY.clientId,
          token_use: 'access',
          sub: 'admin-subject',
          scope: `openid ${SECURITY.adminScope}`,
        }
      : options.claims;
  return {
    routeKey,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.id || options.role
      ? {
          pathParameters: {
            ...(options.id ? { id: options.id } : {}),
            ...(options.role ? { role: options.role } : {}),
          },
        }
      : {}),
    ...(options.query ? { queryStringParameters: options.query } : {}),
    requestContext: {
      requestId: 'request-12',
      ...(claims === null ? {} : { authorizer: { jwt: { claims } } }),
    },
  };
}

function body(response: AdminApiResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function data(response: AdminApiResponse): Record<string, unknown> {
  const parsed = body(response).data;
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
  return parsed as Record<string, unknown>;
}

function setup(maximumPageSize = Number.POSITIVE_INFINITY) {
  const port = new InMemoryDynamoDbPort([], maximumPageSize);
  const posts = new DynamoDbPostRepository(port, {
    queryPageSize: 2,
    clock: () => new Date(NOW),
  });
  const store = new DynamoDbAdminStore(port, () => new Date(NOW), 2);
  const deletedKeys: string[] = [];
  const logs: string[] = [];
  const media: AdminApiDependencies['media'] = {
    async inspect(postId) {
      return {
        postId,
        postVersion: 1,
        titles: { ca: 'Títol', en: 'Title' },
        images: { main: null, thumb: null },
      };
    },
    async createUpload(postId, descriptor) {
      return {
        uploadId: 'a'.repeat(64),
        objectKey: `temporary/${postId}.webp`,
        uploadUrl: 'https://signed.example.invalid/upload?redacted=1',
        headers: {
          'content-type': descriptor.contentType,
          'x-amz-checksum-sha256': descriptor.checksumSha256,
        },
        expiresAt: NOW,
        postVersion: descriptor.expectedVersion,
      };
    },
    async confirmUpload(input) {
      return {
        postId: input.postId,
        postVersion: 2,
        role: 'main',
        image: {
          image: image('main'),
          previewUrl: 'https://signed.example.invalid/preview?redacted=1',
          previewExpiresAt: NOW,
        },
        cleanupPending: false,
        replayed: false,
      };
    },
  };
  const objects = {
    async delete(key: string) {
      deletedKeys.push(key);
    },
  };
  const logger: NonNullable<AdminApiDependencies['logger']> = {
    info: value => logs.push(JSON.stringify(value)),
    warn: value => logs.push(JSON.stringify(value)),
    error: value => logs.push(JSON.stringify(value)),
  };
  const dependencies: AdminApiDependencies = {
    posts,
    store,
    media,
    objects,
    security: SECURITY,
    clock: () => new Date(NOW),
    logger,
  };
  return {
    port,
    posts,
    store,
    media,
    objects,
    logger,
    logs,
    deletedKeys,
    dependencies,
    handler: createAdminApiHandler(dependencies),
  };
}

test('authentication failures use stable 401 and admin-claim 403 envelopes before data access', async () => {
  const { handler, port } = setup();
  const missing = await handler(event('GET /health', { claims: null }));
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(body(missing), {
    version: 1,
    error: { code: 'UNAUTHORIZED', message: 'Sign-in required' },
    requestId: 'request-12',
  });

  const forbidden = await handler(
    event('GET /health', {
      claims: {
        iss: SECURITY.issuer,
        client_id: SECURITY.clientId,
        token_use: 'access',
        sub: 'admin-subject',
        scope: 'openid',
      },
    })
  );
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(body(forbidden), {
    version: 1,
    error: { code: 'FORBIDDEN', message: 'Access denied' },
    requestId: 'request-12',
  });
  const wrongAudience = await handler(
    event('GET /health', {
      claims: {
        iss: SECURITY.issuer,
        client_id: 'wrong-client',
        token_use: 'access',
        sub: 'admin-subject',
        scope: SECURITY.adminScope,
      },
    })
  );
  assert.equal(wrongAudience.statusCode, 401);
  assert.deepEqual(port.requests, {
    gets: 0,
    queries: 0,
    scans: 0,
    transactions: 0,
  });
});

test('concurrent retries with one mutation key cannot create duplicate posts', async () => {
  const { handler, port } = setup();
  const createEvent = event('POST /posts', {
    body: postFixture('post-concurrent'),
    headers: { 'idempotency-key': 'create-concurrent' },
  });
  const responses = await Promise.all([
    handler(createEvent),
    handler(createEvent),
  ]);
  assert.deepEqual(
    responses.map(response => response.statusCode).sort(),
    [201, 409]
  );
  assert.equal(
    port.snapshot().filter(item => item.entityType === 'POST').length,
    1
  );
});

test('post create is idempotent and list/get/update preserve stable contracts and conflicts', async () => {
  const { handler, posts, port } = setup(2);
  const input = postFixture('post-1');
  const createEvent = event('POST /posts', {
    body: input,
    headers: { 'idempotency-key': 'create-post-0001' },
  });
  const created = await handler(createEvent);
  assert.equal(created.statusCode, 201);
  assert.equal(created.headers.etag, '"1"');

  const replayed = await handler(createEvent);
  assert.equal(replayed.statusCode, 200);
  assert.equal(data(replayed).replayed, true);
  assert.equal(
    port.snapshot().filter(item => item.entityType === 'POST').length,
    1
  );

  const listed = await handler(
    event('GET /posts', {
      query: { limit: '1', published: 'false', direction: 'ascending' },
    })
  );
  assert.equal(listed.statusCode, 200);
  assert.equal((data(listed).items as unknown[]).length, 1);

  const missingBoth = await handler(
    event('GET /posts', { query: { imageStatus: 'missing-both' } })
  );
  assert.equal(missingBoth.statusCode, 200);
  assert.equal((data(missingBoth).items as unknown[]).length, 1);
  const invalidImageStatus = await handler(
    event('GET /posts', { query: { imageStatus: 'unknown' } })
  );
  assert.equal(invalidImageStatus.statusCode, 400);

  const fetched = await handler(event('GET /posts/{id}', { id: 'post-1' }));
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.headers.etag, '"1"');

  const updateInput = { ...input, author: 'Updated Author' };
  const updated = await handler(
    event('PUT /posts/{id}', {
      id: 'post-1',
      body: updateInput,
      headers: {
        'if-match': '"1"',
        'idempotency-key': 'update-post-0001',
      },
    })
  );
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.headers.etag, '"2"');

  const publicationBypass = await handler(
    event('PUT /posts/{id}', {
      id: 'post-1',
      body: { ...updateInput, published: true },
      headers: {
        'if-match': '"2"',
        'idempotency-key': 'update-publish-bypass',
      },
    })
  );
  assert.equal(publicationBypass.statusCode, 400);
  assert.equal(
    (body(publicationBypass).error as { code: string }).code,
    'PUBLICATION_ROUTE_REQUIRED'
  );

  const stale = await handler(
    event('PUT /posts/{id}', {
      id: 'post-1',
      body: { ...updateInput, author: 'Lost update' },
      headers: {
        'if-match': '"1"',
        'idempotency-key': 'update-post-stale',
      },
    })
  );
  assert.equal(stale.statusCode, 409);
  assert.equal(
    (body(stale).error as { code: string }).code,
    'POST_VERSION_CONFLICT'
  );
  assert.equal((await posts.getById('post-1'))?.author, 'Updated Author');

  const invalidLimit = await handler(
    event('GET /posts', { query: { limit: '5000' } })
  );
  assert.equal(invalidLimit.statusCode, 400);
  assert.equal(
    (body(invalidLimit).error as { code: string }).code,
    'INVALID_PAGE_LIMIT'
  );
});

test('single and bulk publication require explicit confirmation and use conditional versions', async () => {
  const { handler, posts } = setup(2);
  await posts.create(postFixture('post-1'));
  await posts.create(postFixture('post-2'));

  const published = await handler(
    event('PUT /posts/{id}/publication', {
      id: 'post-1',
      body: { published: true, confirmation: 'PUBLISH' },
      headers: {
        'if-match': '1',
        'idempotency-key': 'publish-post-001',
      },
    })
  );
  assert.equal(published.statusCode, 200);
  assert.equal((await posts.getById('post-1'))?.published, true);

  const unpublish = await handler(
    event('PUT /posts/{id}/publication', {
      id: 'post-1',
      body: { published: false, confirmation: 'UNPUBLISH' },
      headers: {
        'if-match': '2',
        'idempotency-key': 'unpublish-post-1',
      },
    })
  );
  assert.equal(unpublish.statusCode, 200);

  const unconfirmed = await handler(
    event('POST /posts/publication/bulk', {
      body: { published: true },
      headers: { 'idempotency-key': 'bulk-publish-bad' },
    })
  );
  assert.equal(unconfirmed.statusCode, 400);
  assert.equal(
    (body(unconfirmed).error as { code: string }).code,
    'CONFIRMATION_REQUIRED'
  );

  const bulkEvent = event('POST /posts/publication/bulk', {
    body: { published: true, confirmation: 'PUBLISH_ALL' },
    headers: { 'idempotency-key': 'bulk-publish-all' },
  });
  const bulk = await handler(bulkEvent);
  assert.equal(bulk.statusCode, 200);
  assert.equal(data(bulk).publishedCount, 2);
  const bulkReplay = await handler(bulkEvent);
  assert.equal(data(bulkReplay).replayed, true);
});

test('category and keyword list/create/update/delete routes provide versioned management', async () => {
  const { handler } = setup(1);
  const categoryCreated = await handler(
    event('POST /categories', {
      body: {
        id: 'category-1',
        slug: 'category-one',
        names: { ca: 'Categoria', en: 'Category' },
      },
      headers: { 'idempotency-key': 'category-create1' },
    })
  );
  assert.equal(categoryCreated.statusCode, 201);
  assert.equal(categoryCreated.headers.etag, '"1"');
  const categories = await handler(event('GET /categories'));
  assert.equal((data(categories).items as unknown[]).length, 1);
  const categoryUpdated = await handler(
    event('PUT /categories/{id}', {
      id: 'category-1',
      body: {
        slug: 'category-one',
        names: { ca: 'Categoria nova', en: 'New category' },
      },
      headers: {
        'if-match': '1',
        'idempotency-key': 'category-update1',
      },
    })
  );
  assert.equal(categoryUpdated.headers.etag, '"2"');
  const categoryDeleted = await handler(
    event('DELETE /categories/{id}', {
      id: 'category-1',
      headers: {
        'if-match': '2',
        'idempotency-key': 'category-delete1',
      },
    })
  );
  assert.equal(categoryDeleted.statusCode, 200);

  const keywordCreated = await handler(
    event('POST /keywords', {
      body: { id: 'keyword-1', language: 'ca', value: 'arquitectura' },
      headers: { 'idempotency-key': 'keyword-create01' },
    })
  );
  assert.equal(keywordCreated.statusCode, 201);
  const keywords = await handler(
    event('GET /keywords', { query: { language: 'ca' } })
  );
  assert.equal((data(keywords).items as unknown[]).length, 1);
  const keywordUpdated = await handler(
    event('PUT /keywords/{id}', {
      id: 'keyword-1',
      body: { language: 'ca', value: 'disseny' },
      headers: {
        'if-match': '1',
        'idempotency-key': 'keyword-update01',
      },
    })
  );
  assert.equal(keywordUpdated.headers.etag, '"2"');
  const keywordDeleted = await handler(
    event('DELETE /keywords/{id}', {
      id: 'keyword-1',
      headers: {
        'if-match': '2',
        'idempotency-key': 'keyword-delete01',
      },
    })
  );
  assert.equal(keywordDeleted.statusCode, 200);
});

test('delete remains data-atomic and retries observable image cleanup with the same key', async () => {
  const setupValue = setup();
  const { handler, posts, deletedKeys, dependencies } = setupValue;
  await posts.create(postFixture('post-delete', { images: true }));
  let failMain = true;
  dependencies.objects.delete = async key => {
    deletedKeys.push(key);
    if (key.includes('/main/') && failMain) {
      failMain = false;
      throw new Error('simulated cleanup failure');
    }
  };
  const deleteEvent = event('DELETE /posts/{id}', {
    id: 'post-delete',
    headers: {
      'if-match': '1',
      'idempotency-key': 'delete-post-0001',
    },
  });
  const first = await handler(deleteEvent);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(data(first).cleanup, {
    pending: true,
    failedCount: 1,
    retryWithSameIdempotencyKey: true,
  });
  assert.equal(await posts.getById('post-delete'), null);

  const retry = await handler(deleteEvent);
  assert.equal(retry.statusCode, 200);
  assert.deepEqual(data(retry).cleanup, {
    pending: false,
    failedCount: 0,
    retryWithSameIdempotencyKey: false,
  });
  assert.equal(data(retry).replayed, true);
  assert.equal(deletedKeys.filter(key => key.includes('/main/')).length, 2);
});

test('image detach is conditional, idempotent, and retries cleanup after commit', async () => {
  const setupValue = setup();
  const { handler, posts, deletedKeys, dependencies } = setupValue;
  await posts.create(postFixture('post-delete', { images: true }));
  let failCleanup = true;
  dependencies.objects.delete = async key => {
    deletedKeys.push(key);
    if (failCleanup) {
      failCleanup = false;
      throw new Error('simulated detach cleanup failure');
    }
  };
  const detachEvent = event('DELETE /posts/{id}/images/{role}', {
    id: 'post-delete',
    role: 'main',
    headers: {
      'if-match': '1',
      'idempotency-key': 'detach-main-0001',
    },
  });

  const first = await handler(detachEvent);
  assert.equal(first.statusCode, 200);
  assert.equal(data(first).postVersion, 2);
  assert.equal(data(first).detached, true);
  assert.deepEqual(data(first).cleanup, {
    pending: true,
    failedCount: 1,
    retryWithSameIdempotencyKey: true,
  });
  const stored = await posts.getById('post-delete');
  assert.equal(stored?.mainImage, null);
  assert.ok(stored?.thumbImage);

  const retry = await handler(detachEvent);
  assert.equal(retry.statusCode, 200);
  assert.equal(data(retry).replayed, true);
  assert.deepEqual(data(retry).cleanup, {
    pending: false,
    failedCount: 0,
    retryWithSameIdempotencyKey: false,
  });
  assert.equal(deletedKeys.length, 2);

  const stale = await handler(
    event('DELETE /posts/{id}/images/{role}', {
      id: 'post-delete',
      role: 'thumb',
      headers: {
        'if-match': '1',
        'idempotency-key': 'detach-thumb-stale',
      },
    })
  );
  assert.equal(stale.statusCode, 409);
  assert.ok((await posts.getById('post-delete'))?.thumbImage);
});

test('backup route paginates the full table and emits a restoration schema with integrity data', async () => {
  const { handler, posts, port } = setup(2);
  await posts.create(postFixture('post-1'));
  await posts.create(postFixture('post-2'));
  const result = await handler(event('GET /backup'));
  assert.equal(result.statusCode, 200);
  assert.match(result.headers['content-disposition'], /attachment/);
  const backup = JSON.parse(result.body) as Record<string, unknown>;
  assert.deepEqual(validateDynamoDbBackup(backup), []);
  const manifest = backup.manifest as Record<string, unknown>;
  assert.equal((manifest.pageCount as number) > 1, true);
  assert.equal(manifest.itemCount, (backup.items as unknown[]).length);
  assert.equal(port.requests.scans, manifest.pageCount);
  const corrupted = structuredClone(backup);
  (corrupted.items as Array<Record<string, unknown>>)[0].entityType =
    'CORRUPTED';
  assert.equal(
    validateDynamoDbBackup(corrupted).some(
      issue => issue.code === 'DIGEST_MISMATCH'
    ),
    true
  );
  const unsupported = structuredClone(backup);
  (unsupported.items as Array<Record<string, unknown>>)[0].setValue = new Set([
    'not-json',
  ]);
  assert.equal(
    validateDynamoDbBackup(unsupported).some(
      issue => issue.code === 'UNSUPPORTED_VALUE'
    ),
    true
  );
});

test('media routes retain their presign/confirm contracts without logging signed URLs', async () => {
  const { handler, logs } = setup();
  const inspection = await handler(
    event('GET /posts/{id}/images', { id: 'post-1' })
  );
  assert.equal(inspection.statusCode, 200);

  const presign = await handler(
    event('POST /posts/{id}/images/presign', {
      id: 'post-1',
      body: {
        role: 'main',
        fileName: 'fixture.webp',
        contentType: 'image/webp',
        sizeBytes: 1024,
        checksumSha256: `${'a'.repeat(43)}=`,
        expectedVersion: 1,
      },
      headers: { 'idempotency-key': 'media-presign-01' },
    })
  );
  assert.equal(presign.statusCode, 201);

  const confirm = await handler(
    event('POST /posts/{id}/images/confirm', {
      id: 'post-1',
      body: { uploadId: 'a'.repeat(64), title: 'Safe', alt: 'Safe alt' },
      headers: { 'idempotency-key': 'media-confirm-01' },
    })
  );
  assert.equal(confirm.statusCode, 200);
  assert.equal(
    logs.some(log => log.includes('signed.example.invalid')),
    false
  );
});

test('internal errors and throttling keep stable safe envelopes and redact bodies and tokens', async () => {
  const setupValue = setup();
  const secret = 'secret full content eyJ-token X-Amz-Signature';
  setupValue.dependencies.posts.list = async () => {
    const error = new Error(secret);
    error.name = 'UnexpectedRepositoryError';
    throw error;
  };
  const failed = await setupValue.handler(
    event('GET /posts', {
      headers: { authorization: `Bearer ${secret}` },
    })
  );
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(body(failed), {
    version: 1,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed',
    },
    requestId: 'request-12',
  });
  assert.equal(
    setupValue.logs.some(log => log.includes(secret)),
    false
  );

  setupValue.dependencies.posts.list = async () => {
    const error = new Error('do not leak');
    error.name = 'ThrottlingException';
    throw error;
  };
  const throttled = await setupValue.handler(event('GET /posts'));
  assert.equal(throttled.statusCode, 429);
  assert.equal(throttled.headers['retry-after'], '1');

  const oversized = event('POST /posts', {
    headers: { 'idempotency-key': 'oversized-body-1' },
  });
  oversized.body = 'x'.repeat(256 * 1024 + 1);
  const rejected = await setupValue.handler(oversized);
  assert.equal(rejected.statusCode, 413);
  assert.equal(
    (body(rejected).error as { code: string }).code,
    'BODY_TOO_LARGE'
  );
});
