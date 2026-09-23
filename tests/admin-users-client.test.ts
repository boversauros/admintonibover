import assert from 'node:assert/strict';
import test from 'node:test';

import { listUsers, UserApiError } from '../lib/api/users';

test('undeployed AWS users route explains HTTP 404 instead of showing a generic error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ message: 'Not Found' }, { status: 404 });
  try {
    await assert.rejects(
      () => listUsers(),
      (error: unknown) =>
        error instanceof UserApiError &&
        error.status === 404 &&
        error.message.includes('Cal desplegar la infraestructura')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unexpected non-JSON user API responses still expose a safe HTTP status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('upstream failure', { status: 502 });
  try {
    await assert.rejects(
      () => listUsers(),
      (error: unknown) =>
        error instanceof UserApiError &&
        error.status === 502 &&
        error.message.includes('HTTP 502') &&
        !error.message.includes('upstream failure')
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
