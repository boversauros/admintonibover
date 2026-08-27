import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  AdminMutationError,
  buildAwsPost,
  countAdminPosts,
  countDraftPosts,
  createAwsPost,
  deleteAdminPost,
  publishAllAdminPosts,
  updateAwsPost,
  uploadAwsPostImage,
} from '../lib/api/adminMutations';
import type { Post } from '../lib/domain/posts/types';
import type { StoredPost } from '../lib/types/post';
import { proxyAwsAdminApi } from '../lib/aws/admin-api-proxy';

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
    migration: { source: 'supabase-backup', runId: 'migration-1' },
  };
}

function storedFixture(post = postFixture()): StoredPost {
  return {
    id: post.id,
    user_id: '',
    category_id: post.category.id,
    sort_order: post.sortOrder,
    thumbnail_id: null,
    image_id: post.mainImage?.key ?? null,
    is_published: post.published,
    date: post.date,
    author: post.author,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    version: post.version,
    aws_post: post,
    translations: {
      ca: {
        language: 'ca',
        post_id: post.id,
        title: 'Títol actualitzat',
        content: 'Contingut actualitzat',
        slug: 'titol-actualitzat',
        keywords: ['filosofia', 'arquitectura'],
        references: [
          {
            id: 'reference-ca',
            type: 'text',
            reference: 'Font catalana',
            blockquote: 'Cita actualitzada',
            sort_order: 0,
          },
        ],
      },
      en: {
        language: 'en',
        post_id: post.id,
        title: post.translations.en.title,
        content: post.translations.en.content,
        slug: post.translations.en.slug,
        keywords: ['philosophy'],
        references: [],
      },
    },
  };
}

function postEnvelope(post: Post, replayed = false): Record<string, unknown> {
  return {
    version: 1,
    data: { post, replayed },
    requestId: 'request-1',
  };
}

test('AWS post adapter preserves canonical IDs, images, migration state, and every editable field', () => {
  const current = postFixture();
  const stored = storedFixture(current);
  const adapted = buildAwsPost(stored, {
    categorySlug: 'reflexions',
    now: '2026-08-22T11:00:00.000Z',
  });

  assert.equal(adapted.id, current.id);
  assert.deepEqual(adapted.category, current.category);
  assert.equal(adapted.version, 7);
  assert.equal(adapted.published, false);
  assert.deepEqual(adapted.mainImage, current.mainImage);
  assert.deepEqual(adapted.migration, current.migration);
  assert.equal(adapted.translations.ca.id, 'translation-ca');
  assert.equal(adapted.translations.ca.keywords[0]?.id, 'keyword-ca');
  assert.equal(adapted.translations.ca.keywords[1]?.value, 'arquitectura');
  assert.match(
    adapted.translations.ca.keywords[1]?.id ?? '',
    /^keyword-ca-[0-9a-f-]{36}$/
  );
  assert.equal(adapted.translations.ca.references[0]?.id, 'reference-ca');
  assert.equal(adapted.translations.ca.title, 'Títol actualitzat');
  assert.equal(adapted.translations.ca.content, 'Contingut actualitzat');
  assert.equal(adapted.translations.ca.slug, 'titol-actualitzat');
});

test('new AWS posts are constructed as drafts with null images before upload', () => {
  const stored = storedFixture();
  delete stored.aws_post;
  stored.id = '';
  stored.image_id = null;
  const created = buildAwsPost(stored, {
    categorySlug: 'reflexions',
    postId: 'post-new',
    published: false,
    now: NOW,
  });

  assert.equal(created.id, 'post-new');
  assert.equal(created.published, false);
  assert.equal(created.mainImage, null);
  assert.equal(created.thumbImage, null);
  assert.equal(created.migration, null);
});

test('create retries a transient gateway failure with the same idempotency key', async () => {
  const post = postFixture();
  const keys: string[] = [];
  let requests = 0;
  const result = await createAwsPost(
    post,
    'post-create:fixed-key',
    async (input, init) => {
      requests += 1;
      assert.equal(String(input), '/api/aws/posts');
      assert.equal(init?.method, 'POST');
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
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
    }
  );

  assert.equal(result.id, post.id);
  assert.equal(requests, 2);
  assert.deepEqual(keys, ['post-create:fixed-key', 'post-create:fixed-key']);
});

test('updates forward the optimistic version and surface a typed conflict without retrying', async () => {
  const post = postFixture();
  let requests = 0;
  await assert.rejects(
    updateAwsPost(post, 7, 'post-update:fixed-key', async (_input, init) => {
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
    'aws',
    { id: 'post-1', version: 7 },
    'post-delete:fixed-key',
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
            retryWithSameIdempotencyKey: false,
          },
          replayed: false,
        },
        requestId: 'delete-request',
      });
    }
  );
  assert.equal(deleteResult.postId, 'post-1');
  assert.equal(deleteResult.cleanup.pending, false);

  const bulk = await publishAllAdminPosts(
    'aws',
    'posts-publish-all:fixed-key',
    async (_input, init) => {
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        published: true,
        confirmation: 'PUBLISH_ALL',
      });
      return Response.json({
        version: 1,
        data: { publishedCount: 100, replayed: false },
        requestId: 'bulk-request',
      });
    }
  );
  assert.equal(bulk.publishedCount, 100);
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
            thumbImage: null,
          },
        ],
        nextCursor: secondPage ? null : 'next-page',
      },
      requestId: 'count-request',
    });
  };

  try {
    assert.equal(await countAdminPosts('aws'), 2);
    assert.equal(await countDraftPosts('aws'), 2);
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

test('Supabase rollback flag rejects the AWS mutation proxy before any upstream request', async () => {
  const originalBackend = process.env.ADMIN_DATA_BACKEND;
  const originalFetch = globalThis.fetch;
  let upstreamRequests = 0;
  process.env.ADMIN_DATA_BACKEND = 'supabase';
  globalThis.fetch = async () => {
    upstreamRequests += 1;
    return new Response();
  };

  try {
    const request = new NextRequest('http://localhost/api/aws/posts', {
      method: 'POST',
      body: '{}',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
    });
    const response = await proxyAwsAdminApi(request, 'posts', 'POST');
    assert.equal(response.status, 404);
    assert.equal(upstreamRequests, 0);
  } finally {
    if (originalBackend === undefined) {
      delete process.env.ADMIN_DATA_BACKEND;
    } else {
      process.env.ADMIN_DATA_BACKEND = originalBackend;
    }
    globalThis.fetch = originalFetch;
  }
});

test('image replacement presigns, uploads, and confirms in order without a frontend delete', async () => {
  const calls: Array<{ method: string; path: string }> = [];
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
          replayed: false,
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
