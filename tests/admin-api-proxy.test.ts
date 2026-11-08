import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  forwardToAdminApi,
  MAX_PROXY_BODY_BYTES,
  readBoundedRequestBody,
} from '../lib/aws/admin-api-proxy';

const ACCESS_TOKEN = 'private-access-token-that-must-not-leak';
const API_URL = 'https://api.example.invalid/admin/';

function request(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(`https://admin.example.invalid${url}`, init);
}

test('Next.js admin proxy accepts the boundary and rejects larger bodies', async () => {
  const accepted = request('/api/aws/posts', {
    method: 'POST',
    body: 'a'.repeat(MAX_PROXY_BODY_BYTES),
  });
  assert.equal(
    (await readBoundedRequestBody(accepted)).length,
    MAX_PROXY_BODY_BYTES
  );

  const rejected = request('/api/aws/posts', {
    method: 'POST',
    body: 'a'.repeat(MAX_PROXY_BODY_BYTES + 1),
  });
  await assert.rejects(() => readBoundedRequestBody(rejected));
});

test('a read forwards the query string as is with the server token', async () => {
  const sent: { url: string; headers: Headers; method?: string }[] = [];
  const upstreamBody = JSON.stringify({
    version: 1,
    data: { items: [], nextCursor: null },
    requestId: 'upstream-request',
  });
  const response = await forwardToAdminApi({
    accessToken: ACCESS_TOKEN,
    apiUrl: API_URL,
    method: 'GET',
    path: 'posts',
    request: request(
      '/api/aws/posts?limit=10&cursor=page-2&direction=ascending&title=reflexi%C3%B3&published=false&categoryId=category-1&imageStatus=missing-thumbnail'
    ),
    requestId: 'browser-correlation',
    fetchImplementation: async (input, init) => {
      sent.push({
        url: String(input),
        headers: new Headers(init?.headers),
        method: init?.method,
      });
      return new Response(upstreamBody, {
        headers: {
          etag: '"posts-v3"',
          'x-correlation-id': 'upstream-request',
        },
      });
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(
    sent[0]?.url,
    'https://api.example.invalid/admin/posts?limit=10&cursor=page-2&direction=ascending&title=reflexi%C3%B3&published=false&categoryId=category-1&imageStatus=missing-thumbnail'
  );
  assert.equal(sent[0]?.method, 'GET');
  assert.equal(sent[0]?.headers.get('authorization'), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(sent[0]?.headers.get('x-correlation-id'), 'browser-correlation');
  assert.equal(sent[0]?.headers.get('content-type'), null);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), upstreamBody);
  assert.equal(response.headers.get('etag'), '"posts-v3"');
  assert.equal(response.headers.get('x-correlation-id'), 'upstream-request');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('a write forwards its body and expected version but not the query', async () => {
  let sentUrl = '';
  let sentHeaders = new Headers();
  let sentBody: unknown;
  await forwardToAdminApi({
    accessToken: ACCESS_TOKEN,
    apiUrl: API_URL,
    body: '{"published":true}',
    method: 'PUT',
    path: 'posts/post-1/publication',
    request: request('/api/aws/posts/post-1/publication?ignored=1', {
      method: 'PUT',
      headers: { 'if-match': '"4"' },
    }),
    requestId: 'browser-correlation',
    fetchImplementation: async (input, init) => {
      sentUrl = String(input);
      sentHeaders = new Headers(init?.headers);
      sentBody = init?.body;
      return Response.json({ version: 1, data: {}, requestId: 'r' });
    },
  });

  assert.equal(
    sentUrl,
    'https://api.example.invalid/admin/posts/post-1/publication'
  );
  assert.equal(sentBody, '{"published":true}');
  assert.equal(sentHeaders.get('content-type'), 'application/json');
  assert.equal(sentHeaders.get('if-match'), '"4"');
});

for (const status of [401, 403, 404, 409, 429, 500]) {
  test(`upstream ${status} reaches the browser unchanged and without the token`, async () => {
    const upstream = JSON.stringify({
      version: 1,
      error: { code: `STATUS_${status}`, message: 'Safe operator message' },
      requestId: `request-${status}`,
    });
    const response = await forwardToAdminApi({
      accessToken: ACCESS_TOKEN,
      apiUrl: API_URL,
      method: 'GET',
      path: 'categories',
      request: request('/api/aws/categories'),
      requestId: 'local-request',
      fetchImplementation: async () =>
        new Response(upstream, {
          status,
          headers: status === 429 ? { 'retry-after': '7' } : undefined,
        }),
    });

    assert.equal(response.status, status);
    const text = await response.text();
    assert.equal(text, upstream);
    assert.equal(
      response.headers.get('retry-after'),
      status === 429 ? '7' : null
    );
    assert.doesNotMatch(text, /private-access-token/);
  });
}

test('timeouts and unavailable upstreams are distinguished without leaking details', async t => {
  async function failWith(error: Error) {
    const response = await forwardToAdminApi({
      accessToken: ACCESS_TOKEN,
      apiUrl: API_URL,
      method: 'GET',
      path: 'keywords',
      request: request('/api/aws/keywords'),
      requestId: 'local-request',
      fetchImplementation: async () => {
        throw error;
      },
    });
    return { status: response.status, body: await response.text() };
  }

  await t.test('timeout', async () => {
    const { status, body } = await failWith(
      new DOMException('request exceeded deadline', 'TimeoutError')
    );
    assert.equal(status, 504);
    assert.equal(JSON.parse(body).error.code, 'UPSTREAM_TIMEOUT');
    assert.equal(JSON.parse(body).requestId, 'local-request');
    assert.doesNotMatch(body, /deadline|private-access-token/);
  });

  await t.test('network failure', async () => {
    const { status, body } = await failWith(
      new Error('internal host and content details')
    );
    assert.equal(status, 502);
    assert.equal(JSON.parse(body).error.code, 'UPSTREAM_UNAVAILABLE');
    assert.doesNotMatch(body, /internal host|private-access-token/);
  });
});
