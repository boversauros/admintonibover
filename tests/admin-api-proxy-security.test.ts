import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  MAX_PROXY_BODY_BYTES,
  readBoundedRequestBody,
} from '../lib/aws/admin-api-proxy';

test('Next.js admin proxy accepts the boundary and rejects larger bodies', async () => {
  const accepted = new NextRequest(
    'https://admin.example.invalid/api/aws/posts',
    {
      method: 'POST',
      body: 'a'.repeat(MAX_PROXY_BODY_BYTES),
    }
  );
  assert.equal(
    (await readBoundedRequestBody(accepted)).length,
    MAX_PROXY_BODY_BYTES
  );

  const rejected = new NextRequest(
    'https://admin.example.invalid/api/aws/posts',
    {
      method: 'POST',
      body: 'a'.repeat(MAX_PROXY_BODY_BYTES + 1),
    }
  );
  await assert.rejects(() => readBoundedRequestBody(rejected));
});
