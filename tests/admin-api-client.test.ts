import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptAwsPost,
  getAdminCategories,
  getAdminImageInventory,
  getAdminPostsPage,
} from '../lib/api/adminReads';
import { AdminApiClient } from '../lib/aws/admin-api-client';
import type {
  AdminApiErrorEnvelope,
  AdminApiSuccessEnvelope,
  AdminPostListPage,
} from '../lib/aws/admin-read-contract';
import { parseAdminPostListSearchParams } from '../lib/aws/admin-post-list-query';
import type { Post, PostImage, PostListItem } from '../lib/domain/posts/types';

const NOW = '2026-08-22T10:00:00.000Z';
const ACCESS_TOKEN = 'private-access-token-that-must-not-leak';

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

function listItem(id: string, sortOrder: number): PostListItem {
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
  };
}

function postFixture(withImages: boolean): Post {
  return {
    id: 'post-1',
    category: { id: 'category-1', slug: 'reflexions' },
    sortOrder: 4,
    published: true,
    date: '2026-08-22',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: {
        id: 'translation-ca',
        title: 'Una reflexió',
        content: 'Contingut complet',
        slug: 'una-reflexio',
        keywords: [{ id: 'keyword-ca', value: 'filosofia' }],
        references: [
          {
            id: 'reference-ca',
            type: 'text',
            reference: 'Una font',
            sortOrder: 0,
          },
        ],
        translationStatus: 'complete',
      },
      en: {
        id: 'translation-en',
        title: 'A reflection',
        content: 'Complete content',
        slug: 'a-reflection',
        keywords: [{ id: 'keyword-en', value: 'philosophy' }],
        references: [],
        translationStatus: 'complete',
      },
    },
    mainImage: withImages ? image('main') : null,
    thumbImage: withImages ? image('thumb') : null,
    version: 3,
    migration: null,
  };
}

function successEnvelope<T>(
  data: T,
  requestId = 'upstream-request'
): AdminApiSuccessEnvelope<T> {
  return { version: 1, data, requestId };
}

test('the same-origin posts route preserves image status with the other list filters', () => {
  const options = parseAdminPostListSearchParams(
    new URLSearchParams({
      limit: '10',
      cursor: 'page-2',
      direction: 'ascending',
      title: 'reflexió',
      published: 'false',
      categoryId: 'category-1',
      imageStatus: 'missing-thumbnail',
    })
  );

  assert.deepEqual(options, {
    limit: 10,
    cursor: 'page-2',
    direction: 'ascending',
    title: 'reflexió',
    published: false,
    categoryId: 'category-1',
    imageStatus: 'missing-thumbnail',
  });

  for (const imageStatus of [
    'complete',
    'missing-main',
    'missing-thumbnail',
    'missing-both',
  ]) {
    assert.equal(
      parseAdminPostListSearchParams(new URLSearchParams({ imageStatus }))
        .imageStatus,
      imageStatus
    );
  }
});

test('list reads attach the server token, forward filters, and make one request per page', async () => {
  const requestedUrls: string[] = [];
  const authorizationHeaders: string[] = [];
  const correlationHeaders: string[] = [];
  const pages: AdminPostListPage[] = [
    {
      items: [listItem('post-3', 3), listItem('post-2', 2)],
      nextCursor: 'page-2',
    },
    { items: [listItem('post-1', 1)], nextCursor: null },
  ];
  let requestIndex = 0;
  const client = new AdminApiClient({
    accessToken: ACCESS_TOKEN,
    apiUrl: 'https://api.example.invalid/admin/',
    correlationId: 'browser-correlation',
    fetchImplementation: async (input, init) => {
      requestedUrls.push(String(input));
      const headers = new Headers(init?.headers);
      authorizationHeaders.push(headers.get('authorization') ?? '');
      correlationHeaders.push(headers.get('x-correlation-id') ?? '');
      const page = pages[requestIndex++];
      assert.ok(page);
      return Response.json(successEnvelope(page), {
        headers: { etag: '"posts-v3"' },
      });
    },
  });

  const first = await client.listPosts({
    limit: 2,
    direction: 'descending',
    title: 'reflexió',
    published: true,
    categoryId: 'category-1',
    imageStatus: 'missing-both',
  });
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.envelope.data.nextCursor, 'page-2');

  const second = await client.listPosts({
    limit: 2,
    cursor: 'page-2',
    direction: 'descending',
    title: 'reflexió',
    published: true,
    categoryId: 'category-1',
    imageStatus: 'missing-both',
  });
  assert.equal(second.ok, true);

  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0] ?? '', /limit=2/);
  assert.match(requestedUrls[0] ?? '', /direction=descending/);
  assert.match(requestedUrls[0] ?? '', /title=reflexi%C3%B3/);
  assert.match(requestedUrls[0] ?? '', /published=true/);
  assert.match(requestedUrls[0] ?? '', /categoryId=category-1/);
  assert.match(requestedUrls[0] ?? '', /imageStatus=missing-both/);
  assert.match(requestedUrls[1] ?? '', /cursor=page-2/);
  assert.deepEqual(authorizationHeaders, [
    `Bearer ${ACCESS_TOKEN}`,
    `Bearer ${ACCESS_TOKEN}`,
  ]);
  assert.deepEqual(correlationHeaders, [
    'browser-correlation',
    'browser-correlation',
  ]);

  const ids = [
    ...(first.ok ? first.envelope.data.items : []),
    ...(second.ok ? second.envelope.data.items : []),
  ].map(item => item.id);
  assert.deepEqual(ids, ['post-3', 'post-2', 'post-1']);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(JSON.stringify([first, second]), /private-access-token/);
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

for (const status of [401, 403, 404, 409, 429, 500]) {
  test(`upstream ${status} remains a stable, content-safe error envelope`, async () => {
    let requests = 0;
    const upstream: AdminApiErrorEnvelope = {
      version: 1,
      error: { code: `STATUS_${status}`, message: 'Safe operator message' },
      requestId: `request-${status}`,
    };
    const client = new AdminApiClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: 'https://api.example.invalid',
      correlationId: 'local-request',
      fetchImplementation: async () => {
        requests += 1;
        return Response.json(upstream, {
          status,
          headers: status === 429 ? { 'retry-after': '7' } : undefined,
        });
      },
    });

    const result = await client.listCategories();
    assert.equal(requests, 1);
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.envelope.requestId, `request-${status}`);
    assert.equal(result.envelope.error.code, `STATUS_${status}`);
    assert.equal(
      result.ok ? undefined : result.retryAfter,
      status === 429 ? '7' : undefined
    );
    assert.doesNotMatch(JSON.stringify(result), /private-access-token/);
  });
}

test('timeouts and unavailable upstreams are distinguished without leaking details', async t => {
  await t.test('timeout', async () => {
    const client = new AdminApiClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: 'https://api.example.invalid',
      correlationId: 'timeout-request',
      fetchImplementation: async () => {
        throw new DOMException('request exceeded deadline', 'TimeoutError');
      },
    });
    const result = await client.listKeywords();
    assert.equal(result.ok, false);
    assert.equal(result.status, 504);
    assert.equal(result.envelope.error.code, 'UPSTREAM_TIMEOUT');
    assert.doesNotMatch(
      JSON.stringify(result),
      /deadline|private-access-token/
    );
  });

  await t.test('network failure', async () => {
    const client = new AdminApiClient({
      accessToken: ACCESS_TOKEN,
      apiUrl: 'https://api.example.invalid',
      correlationId: 'network-request',
      fetchImplementation: async () => {
        throw new Error('internal host and content details');
      },
    });
    const result = await client.listKeywords();
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.envelope.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.doesNotMatch(
      JSON.stringify(result),
      /internal host|private-access-token/
    );
  });
});

test('malformed success responses fail closed with a correlation id', async () => {
  const client = new AdminApiClient({
    accessToken: ACCESS_TOKEN,
    apiUrl: 'https://api.example.invalid',
    correlationId: 'local-request',
    fetchImplementation: async () =>
      Response.json(
        { version: 1, data: { items: [{ unexpected: 'content' }] } },
        { headers: { 'x-correlation-id': 'gateway-request' } }
      ),
  });
  const result = await client.listCategories();
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.envelope.error.code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(result.envelope.requestId, 'gateway-request');
  assert.doesNotMatch(JSON.stringify(result), /unexpected|content/);
});

test('detail adapter preserves canonical fields and never fabricates image URLs', () => {
  const withImages = adaptAwsPost(postFixture(true));
  assert.equal(withImages.id, 'post-1');
  assert.equal(withImages.category_id, 'category-1');
  assert.equal(withImages.version, 3);
  assert.equal(withImages.image_id, 'images/post-1/main.webp');
  assert.equal(withImages.image?.key, 'images/post-1/main.webp');
  assert.equal(withImages.image?.url, undefined);
  assert.equal(withImages.thumbnail?.url, undefined);
  assert.deepEqual(withImages.translations.ca.keywords, ['filosofia']);
  assert.deepEqual(withImages.translations.ca.references, [
    {
      id: 'reference-ca',
      type: 'text',
      reference: 'Una font',
      blockquote: '',
      sort_order: 0,
    },
  ]);

  const withoutImages = adaptAwsPost(postFixture(false));
  assert.equal(withoutImages.image, null);
  assert.equal(withoutImages.thumbnail, null);
  assert.equal(withoutImages.image_id, null);
  assert.equal(withoutImages.thumbnail_id, null);
});
