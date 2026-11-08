import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminMutationError,
  countAdminPosts,
  countDraftPosts,
  createAwsPost,
  deleteAdminPost,
  detachAwsPostImage,
  isExactBulkConfirmation,
  publishAllAdminPosts,
  updateAwsPost,
  uploadAwsPostImage,
} from '../lib/api/adminMutations';
import type { Post } from '../lib/domain/posts/types';

const NOW = '2026-08-22T10:00:00.000Z';

function postFixture(): Post {
  return {
    id: 'post-1',
    category: { id: 'category-1', slug: 'reflexions' },
    sortOrder: 4,
    published: false,
    date: '2026-08-20',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: {
        id: 'translation-ca',
        title: 'Títol',
        content: 'Contingut',
        slug: 'titol',
        keywords: [{ id: 'keyword-ca', value: 'filosofia' }],
        references: [
          {
            id: 'reference-ca',
            type: 'text',
            reference: 'Font catalana',
            blockquote: 'Cita',
            sortOrder: 0,
          },
        ],
        translationStatus: 'complete',
      },
      en: {
        id: 'translation-en',
        title: 'Title',
        content: 'Content',
        slug: 'title',
        keywords: [{ id: 'keyword-en', value: 'philosophy' }],
        references: [],
        translationStatus: 'complete',
      },
    },
    mainImage: {
      key: 'images/posts/post-1/main/a.webp',
      title: 'Main',
      alt: 'Main alt',
      contentType: 'image/webp',
      sizeBytes: 1024,
      createdAt: NOW,
      updatedAt: NOW,
    },
    thumbImage: null,
    version: 7,
    migration: { source: 'legacy-backup', runId: 'migration-1' },
  };
}

function postEnvelope(post: Post): Record<string, unknown> {
  return {
    version: 1,
    data: { post },
    requestId: 'request-1',
  };
}

test('bulk publication is not retried after a gateway failure', async () => {
  let requests = 0;
  await assert.rejects(
    publishAllAdminPosts(2, async () => {
      requests += 1;
      return new Response(null, { status: 503 });
    }),
    (error: unknown) =>
      error instanceof AdminMutationError && error.status === 503
  );
  assert.equal(requests, 1);
});

test('create retries a transient gateway failure', async () => {
  const post = postFixture();
  let requests = 0;
  const result = await createAwsPost(post, async (input, init) => {
    requests += 1;
    assert.equal(String(input), '/api/aws/posts');
    assert.equal(init?.method, 'POST');
    return requests === 1
      ? Response.json(
          {
            version: 1,
            error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Unavailable' },
            requestId: 'failed-request',
          },
          { status: 502 }
        )
      : Response.json(postEnvelope(post), { status: 201 });
  });

  assert.equal(result.id, post.id);
  assert.equal(requests, 2);
});

test('updates forward the optimistic version and surface a typed conflict without retrying', async () => {
  const post = postFixture();
  let requests = 0;
  await assert.rejects(
    updateAwsPost(post, 7, async (_input, init) => {
      requests += 1;
      assert.equal(init?.method, 'PUT');
      assert.equal(new Headers(init?.headers).get('if-match'), '"7"');
      return Response.json(
        {
          version: 1,
          error: {
            code: 'POST_VERSION_CONFLICT',
            message: 'The post changed',
          },
          requestId: 'conflict-request',
        },
        { status: 409 }
      );
    }),
    error => {
      assert.ok(error instanceof AdminMutationError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'POST_VERSION_CONFLICT');
      assert.equal(error.requestId, 'conflict-request');
      return true;
    }
  );
  assert.equal(requests, 1);
});

test('AWS delete and bulk publication preserve exact result counts', async () => {
  const deleteResult = await deleteAdminPost(
    { id: 'post-1', version: 7 },
    async (_input, init) => {
      assert.equal(init?.method, 'DELETE');
      assert.equal(new Headers(init?.headers).get('if-match'), '"7"');
      return Response.json({
        version: 1,
        data: {
          postId: 'post-1',
          cleanup: {
            pending: false,
            failedCount: 0,
          },
        },
        requestId: 'delete-request',
      });
    }
  );
  assert.equal(deleteResult.postId, 'post-1');
  assert.equal(deleteResult.cleanup.pending, false);

  const bulk = await publishAllAdminPosts(100, async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      published: true,
      confirmation: 'PUBLISH_ALL',
      expectedCount: 100,
    });
    return Response.json({
      version: 1,
      data: { publishedCount: 100 },
      requestId: 'bulk-request',
    });
  });
  assert.equal(bulk.publishedCount, 100);
});

test('bulk publication confirmation matches only the displayed exact count', () => {
  assert.equal(isExactBulkConfirmation('100', 100), true);
  assert.equal(isExactBulkConfirmation(' 100 ', 100), true);
  assert.equal(isExactBulkConfirmation('99', 100), false);
  assert.equal(isExactBulkConfirmation('PUBLISH_ALL', 100), false);
});

test('AWS bulk publication reports a stale confirmation count clearly', async () => {
  await assert.rejects(
    publishAllAdminPosts(2, async () =>
      Response.json(
        {
          version: 1,
          error: {
            code: 'BULK_COUNT_MISMATCH',
            message: 'Bulk draft count changed',
          },
          requestId: 'bulk-stale-request',
        },
        { status: 409 }
      )
    ),
    error => {
      assert.ok(error instanceof AdminMutationError);
      assert.equal(error.code, 'BULK_COUNT_MISMATCH');
      assert.equal(
        error.message,
        'El nombre d’esborranys ha canviat. Torna a obrir la confirmació amb el recompte actual.'
      );
      return true;
    }
  );
});

test('AWS count helpers paginate exact list and draft counts without credentials', async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    paths.push(path);
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    const secondPage = path.includes('cursor=next-page');
    return Response.json({
      version: 1,
      data: {
        items: [
          {
            id: secondPage ? 'post-2' : 'post-1',
            category: { id: 'category-1', slug: 'reflexions' },
            sortOrder: secondPage ? 2 : 1,
            published: false,
            date: '2026-08-22',
            author: 'Toni Bover',
            updatedAt: NOW,
            version: 1,
            titles: { ca: 'Títol', en: 'Title' },
            excerpts: { ca: 'Resum', en: 'Excerpt' },
            keywords: { ca: [], en: [] },
            mainImage: null,
            thumbImage: null,
          },
        ],
        nextCursor: secondPage ? null : 'next-page',
      },
      requestId: 'count-request',
    });
  };

  try {
    assert.equal(await countAdminPosts(), 2);
    assert.equal(await countDraftPosts(), 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(paths.length, 4);
  assert.equal(
    paths.every(path => path.includes('limit=50')),
    true
  );
  assert.equal(
    paths.some(path => path.includes('limit=100')),
    false
  );
  assert.equal(
    paths.filter(path => path.includes('published=false')).length,
    2
  );
});

test('image replacement presigns, uploads, and confirms in order without a frontend delete', async () => {
  const calls: Array<{ method: string; path: string }> = [];
  const progress: number[] = [];
  const file = new File(['private image bytes'], 'replacement.webp', {
    type: 'image/webp',
  });
  const confirmed = await uploadAwsPostImage({
    postId: 'post-1',
    postVersion: 7,
    role: 'main',
    file,
    title: 'Replacement',
    alt: 'Replacement alt',
    onProgress: value => progress.push(value.percent),
    fetchImplementation: async (input, init) => {
      const path = String(input);
      calls.push({ method: init?.method ?? 'GET', path });
      if (path.endsWith('/images/presign')) {
        const descriptor = JSON.parse(String(init?.body)) as {
          checksumSha256: string;
          expectedVersion: number;
        };
        assert.equal(descriptor.expectedVersion, 7);
        return Response.json(
          {
            version: 1,
            data: {
              uploadId: 'upload-1',
              objectKey: 'temporary/replacement.webp',
              uploadUrl: 'https://signed.example.invalid/replacement',
              headers: {
                'content-type': 'image/webp',
                'x-amz-checksum-sha256': descriptor.checksumSha256,
              },
              expiresAt: '2026-08-22T10:05:00.000Z',
              postVersion: 7,
            },
            requestId: 'presign-request',
          },
          { status: 201 }
        );
      }
      if (path.startsWith('https://signed.example.invalid')) {
        assert.equal(init?.credentials, 'omit');
        assert.equal(init?.body, file);
        return new Response(null, { status: 200 });
      }
      assert.ok(path.endsWith('/images/confirm'));
      assert.deepEqual(JSON.parse(String(init?.body)), {
        uploadId: 'upload-1',
        title: 'Replacement',
        alt: 'Replacement alt',
      });
      return Response.json({
        version: 1,
        data: {
          postId: 'post-1',
          postVersion: 8,
          role: 'main',
          image: {
            image: {
              key: 'images/posts/post-1/main/replacement.webp',
              title: 'Replacement',
              alt: 'Replacement alt',
              contentType: 'image/webp',
              sizeBytes: file.size,
              createdAt: NOW,
              updatedAt: NOW,
            },
            previewUrl: 'https://signed.example.invalid/preview',
            previewExpiresAt: '2026-08-22T10:05:00.000Z',
          },
          cleanupPending: false,
        },
        requestId: 'confirm-request',
      });
    },
  });

  assert.equal(confirmed.postVersion, 8);
  assert.deepEqual(calls, [
    { method: 'POST', path: '/api/aws/posts/post-1/images/presign' },
    { method: 'PUT', path: 'https://signed.example.invalid/replacement' },
    { method: 'POST', path: '/api/aws/posts/post-1/images/confirm' },
  ]);
  assert.equal(
    calls.some(call => call.method === 'DELETE'),
    false
  );
  assert.deepEqual(progress, [0, 100]);
});

test('failed private upload never confirms or removes the existing image', async () => {
  const paths: string[] = [];
  await assert.rejects(
    uploadAwsPostImage({
      postId: 'post-1',
      postVersion: 7,
      role: 'main',
      file: new File(['bad upload'], 'replacement.webp', {
        type: 'image/webp',
      }),
      title: 'Replacement',
      alt: 'Replacement alt',
      fetchImplementation: async (input, init) => {
        const path = String(input);
        paths.push(path);
        if (path.endsWith('/images/presign')) {
          const descriptor = JSON.parse(String(init?.body)) as {
            checksumSha256: string;
          };
          return Response.json(
            {
              version: 1,
              data: {
                uploadId: 'upload-2',
                objectKey: 'temporary/replacement.webp',
                uploadUrl: 'https://signed.example.invalid/failure',
                headers: {
                  'content-type': 'image/webp',
                  'x-amz-checksum-sha256': descriptor.checksumSha256,
                },
                expiresAt: '2026-08-22T10:05:00.000Z',
                postVersion: 7,
              },
              requestId: 'presign-request',
            },
            { status: 201 }
          );
        }
        return new Response(null, { status: 400 });
      },
    }),
    error => {
      assert.ok(error instanceof AdminMutationError);
      assert.equal(error.code, 'IMAGE_UPLOAD_FAILED');
      return true;
    }
  );
  assert.deepEqual(paths, [
    '/api/aws/posts/post-1/images/presign',
    'https://signed.example.invalid/failure',
  ]);
});

test('cancelling a private upload stops before confirmation and remains an abort', async () => {
  const controller = new AbortController();
  const paths: string[] = [];
  await assert.rejects(
    uploadAwsPostImage({
      postId: 'post-1',
      postVersion: 7,
      role: 'thumb',
      file: new File(['cancel me'], 'thumbnail.png', { type: 'image/png' }),
      title: 'Thumbnail',
      alt: 'Thumbnail alt',
      signal: controller.signal,
      uploadTransport: async ({ signal }) => {
        controller.abort();
        signal?.throwIfAborted();
      },
      fetchImplementation: async input => {
        const path = String(input);
        paths.push(path);
        return Response.json(
          {
            version: 1,
            data: {
              uploadId: 'upload-cancelled',
              objectKey: 'temporary/thumbnail.png',
              uploadUrl: 'https://signed.example.invalid/cancelled',
              headers: {
                'content-type': 'image/png',
                'x-amz-checksum-sha256': 'A'.repeat(43) + '=',
              },
              expiresAt: '2026-08-22T10:05:00.000Z',
              postVersion: 7,
            },
            requestId: 'presign-request',
          },
          { status: 201 }
        );
      },
    }),
    error => error instanceof Error && error.name === 'AbortError'
  );
  assert.deepEqual(paths, ['/api/aws/posts/post-1/images/presign']);
});

test('image detach sends the current version and reports failed cleanup', async () => {
  let requestPath = '';
  let requestMethod = '';
  let requestHeaders = new Headers();
  const detached = await detachAwsPostImage({
    postId: 'post-1',
    postVersion: 7,
    role: 'main',
    fetchImplementation: async (input, init) => {
      requestPath = String(input);
      requestMethod = init?.method ?? '';
      requestHeaders = new Headers(init?.headers);
      return Response.json({
        version: 1,
        data: {
          postId: 'post-1',
          postVersion: 8,
          role: 'main',
          detached: true,
          cleanup: {
            pending: true,
            failedCount: 1,
          },
        },
        requestId: 'detach-request',
      });
    },
  });

  assert.equal(requestPath, '/api/aws/posts/post-1/images/main');
  assert.equal(requestMethod, 'DELETE');
  assert.equal(requestHeaders.get('if-match'), '"7"');
  assert.equal(requestHeaders.has('idempotency-key'), false);
  assert.equal(detached.cleanup.pending, true);
});
