import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AdminApiSuccessEnvelope,
  AdminPostListItem,
  AdminPostListPage,
} from '../lib/api/adminContract';
import {
  AdminReadError,
  getAdminCategories,
  getAdminImageInventory,
  getAdminPostsPage,
  resolveUnpublishedCount,
} from '../lib/api/adminReads';
import type { PostImage } from '../lib/domain/posts/types';

const NOW = '2026-08-22T10:00:00.000Z';

function image(role: 'main' | 'thumb'): PostImage {
  return {
    key: `images/post-1/${role}.webp`,
    title: `${role} image`,
    alt: `${role} alternative text`,
    contentType: 'image/webp',
    sizeBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function listItem(id: string, sortOrder: number): AdminPostListItem {
  return {
    id,
    category: { id: 'category-1', slug: 'reflexions' },
    sortOrder,
    published: sortOrder % 2 === 0,
    date: '2026-08-22',
    author: 'Toni Bover',
    updatedAt: NOW,
    version: 3,
    titles: { ca: `Títol ${id}`, en: `Title ${id}` },
    excerpts: { ca: `Resum ${id}`, en: `Excerpt ${id}` },
    keywords: { ca: ['filosofia'], en: ['philosophy'] },
    mainImage: null,
    thumbImage: null,
    thumbPreviewUrl: null,
  };
}

function successEnvelope<T>(
  data: T,
  requestId = 'upstream-request'
): AdminApiSuccessEnvelope<T> {
  return { version: 1, data, requestId };
}

test('an AWS list refresh preserves an independently reconciled draft count', () => {
  assert.equal(resolveUnpublishedCount(0, undefined), 0);
  assert.equal(resolveUnpublishedCount(2, undefined), 2);
});

test('a list response with a draft count replaces the previous value', () => {
  assert.equal(resolveUnpublishedCount(undefined, 2), 2);
  assert.equal(resolveUnpublishedCount(2, 0), 0);
});

test('the browser AWS adapter makes one same-origin request without a bearer token', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let requestedPath = '';
  let requestHeaders = new Headers();
  let credentials: RequestCredentials | undefined;
  globalThis.fetch = async (input, init) => {
    requests += 1;
    requestedPath = String(input);
    requestHeaders = new Headers(init?.headers);
    credentials = init?.credentials;
    return Response.json(
      successEnvelope<AdminPostListPage>({
        items: [listItem('post-1', 1)],
        nextCursor: null,
      })
    );
  };

  try {
    const page = await getAdminPostsPage({
      limit: 10,
      direction: 'descending',
    });
    assert.deepEqual(
      page.items.map(item => item.id),
      ['post-1']
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests, 1);
  assert.equal(requestedPath, '/api/aws/posts?limit=10&direction=descending');
  assert.equal(credentials, 'same-origin');
  assert.equal(requestHeaders.get('authorization'), null);
  assert.match(requestHeaders.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/);
});

test('the browser inventory count covers all four image combinations', async () => {
  const originalFetch = globalThis.fetch;
  const complete = {
    ...listItem('complete', 4),
    mainImage: image('main'),
    thumbImage: image('thumb'),
  };
  const missingMain = {
    ...listItem('missing-main', 3),
    thumbImage: image('thumb'),
  };
  const missingThumbnail = {
    ...listItem('missing-thumbnail', 2),
    mainImage: image('main'),
  };
  const missingBoth = listItem('missing-both', 1);
  globalThis.fetch = async () =>
    Response.json(
      successEnvelope<AdminPostListPage>({
        items: [complete, missingMain, missingThumbnail, missingBoth],
        nextCursor: null,
      })
    );

  try {
    assert.deepEqual(await getAdminImageInventory(), {
      complete: 1,
      'missing-main': 1,
      'missing-thumbnail': 1,
      'missing-both': 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AWS categories include the original category catalog when storage is empty', async () => {
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  globalThis.fetch = async input => {
    const path = String(input);
    requestedPaths.push(path);
    return Response.json(successEnvelope({ items: [] }));
  };

  try {
    assert.deepEqual(await getAdminCategories(), [
      {
        id: '1',
        slug: 'vivencies',
        nameCa: 'Vivències',
        nameEn: 'Experiences',
      },
      {
        id: '2',
        slug: 'influencies',
        nameCa: 'Influències',
        nameEn: 'Influences',
      },
      {
        id: '3',
        slug: 'perspectives',
        nameCa: 'Perspectives',
        nameEn: 'Perspectives',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestedPaths, ['/api/aws/categories']);
});

test('new AWS catalog categories extend the original category list', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      successEnvelope({
        items: [
          {
            id: 'legacy-vivencies',
            slug: 'vivencies',
            names: { ca: 'Vivències', en: 'Experiences' },
            version: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
          {
            id: '4',
            slug: 'future-category',
            names: { ca: 'Categoria futura', en: 'Future category' },
            version: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      })
    );

  try {
    assert.deepEqual(
      (await getAdminCategories()).map(category => ({
        id: category.id,
        slug: category.slug,
      })),
      [
        { id: 'legacy-vivencies', slug: 'vivencies' },
        { id: '2', slug: 'influencies' },
        { id: '3', slug: 'perspectives' },
        { id: '4', slug: 'future-category' },
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a malformed success response is rejected with its correlation id', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { version: 1, data: { items: [{ unexpected: 'content' }] } },
      { headers: { 'x-correlation-id': 'gateway-request' } }
    );

  try {
    await assert.rejects(getAdminCategories(), (error: unknown) => {
      assert.ok(error instanceof AdminReadError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'INVALID_RESPONSE');
      assert.equal(error.requestId, 'gateway-request');
      assert.doesNotMatch(error.message, /unexpected|content/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
