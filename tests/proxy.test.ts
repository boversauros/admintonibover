import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { proxy } from '../proxy';

test('AWS mode allows the new-post route to reach its page', async () => {
  const originalBackend = process.env.ADMIN_DATA_BACKEND;
  process.env.ADMIN_DATA_BACKEND = 'aws';

  try {
    const response = await proxy(
      new NextRequest('http://localhost:3000/reflexions/new')
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-next'), '1');
  } finally {
    if (originalBackend === undefined) {
      delete process.env.ADMIN_DATA_BACKEND;
    } else {
      process.env.ADMIN_DATA_BACKEND = originalBackend;
    }
  }
});
