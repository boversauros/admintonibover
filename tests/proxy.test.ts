import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { buildContentSecurityPolicy, proxy, securityHeaders } from '../proxy';

const productionEnvironment = {
  NODE_ENV: 'production',
  ADMIN_CSP_MODE: 'enforce',
  AWS_CONTENT_BUCKET_ORIGIN:
    'https://private-content.s3.eu-west-1.amazonaws.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://legacy.supabase.co',
} as const;

test('AWS production CSP trusts only self and the exact S3 origin', () => {
  const csp = buildContentSecurityPolicy('aws', productionEnvironment);

  assert.match(
    csp,
    /img-src 'self' data: blob: https:\/\/private-content\.s3\.eu-west-1\.amazonaws\.com/
  );
  assert.match(
    csp,
    /connect-src 'self' https:\/\/private-content\.s3\.eu-west-1\.amazonaws\.com/
  );
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(csp.includes('legacy.supabase.co'), false);
  assert.equal(csp.includes('picsum.photos'), false);
  assert.equal(csp.includes("'unsafe-eval'"), false);
  assert.equal(csp.includes('*'), false);
});

test('Supabase rollback CSP restores only the exact legacy service origins', () => {
  const csp = buildContentSecurityPolicy('supabase', productionEnvironment);

  assert.match(
    csp,
    /connect-src 'self' https:\/\/legacy\.supabase\.co wss:\/\/legacy\.supabase\.co/
  );
  assert.match(
    csp,
    /img-src 'self' data: blob: https:\/\/legacy\.supabase\.co/
  );
  assert.equal(csp.includes('amazonaws.com'), false);
});

test('CSP configuration rejects wildcard, path, and production HTTP origins', () => {
  assert.throws(() =>
    buildContentSecurityPolicy('aws', {
      ...productionEnvironment,
      AWS_CONTENT_BUCKET_ORIGIN: 'https://*.amazonaws.com',
    })
  );
  assert.throws(() =>
    buildContentSecurityPolicy('aws', {
      ...productionEnvironment,
      AWS_CONTENT_BUCKET_ORIGIN:
        'https://private-content.s3.eu-west-1.amazonaws.com/path',
    })
  );
  assert.throws(() =>
    buildContentSecurityPolicy('supabase', {
      ...productionEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    })
  );
});

test('development-only eval and report-only review are explicit', () => {
  const headers = securityHeaders('supabase', {
    NODE_ENV: 'development',
    ADMIN_CSP_MODE: 'report-only',
    AWS_CONTENT_BUCKET_ORIGIN: undefined,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  });
  const values = new Map(headers);

  assert.match(
    values.get('Content-Security-Policy-Report-Only') ?? '',
    /script-src 'self' 'unsafe-inline' 'unsafe-eval'/
  );
  assert.equal(values.has('Content-Security-Policy'), false);
  assert.equal(values.has('Strict-Transport-Security'), false);
});

test('AWS mode allows the new-post route to reach its page', async () => {
  const previous = {
    backend: process.env.ADMIN_DATA_BACKEND,
    bucketOrigin: process.env.AWS_CONTENT_BUCKET_ORIGIN,
  };
  process.env.ADMIN_DATA_BACKEND = 'aws';
  process.env.AWS_CONTENT_BUCKET_ORIGIN =
    'https://private-content.s3.eu-west-1.amazonaws.com';

  try {
    const response = await proxy(
      new NextRequest('http://localhost:3000/reflexions/new')
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  } finally {
    if (previous.backend === undefined) delete process.env.ADMIN_DATA_BACKEND;
    else process.env.ADMIN_DATA_BACKEND = previous.backend;
    if (previous.bucketOrigin === undefined) {
      delete process.env.AWS_CONTENT_BUCKET_ORIGIN;
    } else {
      process.env.AWS_CONTENT_BUCKET_ORIGIN = previous.bucketOrigin;
    }
  }
});
