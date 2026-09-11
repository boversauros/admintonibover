import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { buildContentSecurityPolicy, proxy, securityHeaders } from '../proxy';

const productionEnvironment = {
  NODE_ENV: 'production',
  ADMIN_CSP_MODE: 'enforce',
  AWS_CONTENT_BUCKET_ORIGIN:
    'https://private-content.s3.eu-west-1.amazonaws.com',
} as const;

test('AWS production CSP trusts only self and the exact S3 origin', () => {
  const csp = buildContentSecurityPolicy(productionEnvironment);

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
  assert.equal(csp.includes('picsum.photos'), false);
  assert.equal(csp.includes("'unsafe-eval'"), false);
  assert.equal(csp.includes('*'), false);
});

test('CSP configuration rejects wildcard, path, and production HTTP origins', () => {
  assert.throws(() =>
    buildContentSecurityPolicy({
      ...productionEnvironment,
      AWS_CONTENT_BUCKET_ORIGIN: 'https://*.amazonaws.com',
    })
  );
  assert.throws(() =>
    buildContentSecurityPolicy({
      ...productionEnvironment,
      AWS_CONTENT_BUCKET_ORIGIN:
        'https://private-content.s3.eu-west-1.amazonaws.com/path',
    })
  );
  assert.throws(() =>
    buildContentSecurityPolicy({
      ...productionEnvironment,
      AWS_CONTENT_BUCKET_ORIGIN: 'http://localhost:4566',
    })
  );
});

test('development-only eval and report-only review are explicit', () => {
  const headers = securityHeaders({
    NODE_ENV: 'development',
    ADMIN_CSP_MODE: 'report-only',
    AWS_CONTENT_BUCKET_ORIGIN:
      'https://private-content.s3.eu-west-1.amazonaws.com',
  });
  const values = new Map(headers);

  assert.match(
    values.get('Content-Security-Policy-Report-Only') ?? '',
    /script-src 'self' 'unsafe-inline' 'unsafe-eval'/
  );
  assert.equal(values.has('Content-Security-Policy'), false);
  assert.equal(values.has('Strict-Transport-Security'), false);
});

test('the new-post route reaches its page with AWS security headers', async () => {
  const previous = {
    bucketOrigin: process.env.AWS_CONTENT_BUCKET_ORIGIN,
  };
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
    if (previous.bucketOrigin === undefined) {
      delete process.env.AWS_CONTENT_BUCKET_ORIGIN;
    } else {
      process.env.AWS_CONTENT_BUCKET_ORIGIN = previous.bucketOrigin;
    }
  }
});
