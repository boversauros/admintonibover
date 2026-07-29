import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchTracerPost } from '../lib/aws/tracer-client';

test('Supabase backend does not make an AWS request', async () => {
  let requests = 0;
  const result = await fetchTracerPost({
    accessToken: 'not-used',
    apiUrl: 'https://api.example.invalid',
    backend: 'supabase',
    correlationId: 'flag-off',
    fetchImplementation: async () => {
      requests += 1;
      return new Response();
    },
    postId: 'issue-9-fixture',
  });

  assert.equal(result.status, 404);
  assert.equal(requests, 0);
});

test('signed-out tracer request returns 401 without an AWS request', async () => {
  let requests = 0;
  const result = await fetchTracerPost({
    apiUrl: 'https://api.example.invalid',
    backend: 'aws',
    correlationId: 'signed-out',
    fetchImplementation: async () => {
      requests += 1;
      return new Response();
    },
    postId: 'issue-9-fixture',
  });

  assert.equal(result.status, 401);
  assert.equal(requests, 0);
  assert.deepEqual(result.body, {
    version: 1,
    error: { code: 'UNAUTHORIZED', message: 'Sign in is required' },
    requestId: 'signed-out',
  });
});

test('gateway 401 is normalized to the typed tracer error contract', async () => {
  const result = await fetchTracerPost({
    accessToken: 'access-token',
    apiUrl: 'https://api.example.invalid',
    backend: 'aws',
    correlationId: 'gateway-401',
    fetchImplementation: async () =>
      Response.json(
        { message: 'Unauthorized' },
        {
          status: 401,
          headers: { 'x-correlation-id': 'gateway-request' },
        }
      ),
    postId: 'issue-9-fixture',
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, {
    version: 1,
    error: { code: 'UNAUTHORIZED', message: 'Sign in is required' },
    requestId: 'gateway-request',
  });
});

test('valid Lambda tracer response is returned without widening its fields', async () => {
  let authorization = '';
  const result = await fetchTracerPost({
    accessToken: 'access-token',
    apiUrl: 'https://api.example.invalid',
    backend: 'aws',
    correlationId: 'browser-request',
    fetchImplementation: async (_input, init) => {
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return Response.json({
        version: 1,
        data: {
          id: 'issue-9-fixture',
          title: 'Una primera lectura a DynamoDB',
          migration: {
            source: 'issue-9-fixture',
            status: 'ready',
          },
        },
        requestId: 'browser-request',
      });
    },
    postId: 'issue-9-fixture',
  });

  assert.equal(authorization, 'Bearer access-token');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    version: 1,
    data: {
      id: 'issue-9-fixture',
      title: 'Una primera lectura a DynamoDB',
      migration: {
        source: 'issue-9-fixture',
        status: 'ready',
      },
    },
    requestId: 'browser-request',
  });
});
