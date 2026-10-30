import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCognitoConfig,
  type CognitoConfig,
} from '../lib/auth/cognito/config';
import { cognitoCookieOptions } from '../lib/auth/cognito/cookies';
import {
  isJsonRequest,
  isSameOriginMutation,
  safeReturnTo,
} from '../lib/auth/cognito/http';
import {
  parseCognitoSessionSecret,
  sealCognitoCookie,
  unsealCognitoCookie,
} from '../lib/auth/cognito/seal';

const config: CognitoConfig = {
  apiUrl: 'https://api.example.invalid',
  appOrigin: 'https://admin.example.invalid',
  clientId: 'public-client',
  issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_example',
  region: 'eu-west-1',
};

const sessionSecret = Buffer.alloc(32, 7).toString('base64url');
const sessionKey = parseCognitoSessionSecret(sessionSecret);

test('session secret is exactly 32 bytes of unpadded base64url', () => {
  assert.equal(sessionKey.length, 32);
  assert.throws(() => parseCognitoSessionSecret(undefined));
  assert.throws(() => parseCognitoSessionSecret('too-short'));
  assert.throws(() => parseCognitoSessionSecret(`${sessionSecret}=`));
});

test('AWS configuration requires an exact application origin', () => {
  const names = [
    'ADMIN_APP_ORIGIN',
    'AWS_ADMIN_API_URL',
    'AWS_COGNITO_CLIENT_ID',
    'AWS_COGNITO_ISSUER',
    'AWS_COGNITO_SESSION_SECRET',
    'NODE_ENV',
  ] as const;
  const previous = Object.fromEntries(
    names.map(name => [name, process.env[name]])
  );
  Object.assign(process.env, {
    ADMIN_APP_ORIGIN: config.appOrigin,
    AWS_ADMIN_API_URL: config.apiUrl,
    AWS_COGNITO_CLIENT_ID: config.clientId,
    AWS_COGNITO_ISSUER: config.issuer,
    AWS_COGNITO_SESSION_SECRET: sessionSecret,
  });

  try {
    assert.deepEqual(getCognitoConfig(), config);
    process.env.ADMIN_APP_ORIGIN = 'https://admin.example.invalid/';
    assert.deepEqual(getCognitoConfig(), config);
    process.env.ADMIN_APP_ORIGIN = 'https://admin.example.invalid/auth';
    assert.throws(() => getCognitoConfig());
    process.env.ADMIN_APP_ORIGIN = 'https://admin.example.invalid/?next=/';
    assert.throws(() => getCognitoConfig());
    process.env.ADMIN_APP_ORIGIN = 'https://*.example.invalid';
    assert.throws(() => getCognitoConfig());
    process.env.ADMIN_APP_ORIGIN = 'http://admin.example.invalid';
    assert.throws(() => getCognitoConfig());
    process.env.ADMIN_APP_ORIGIN = 'http://localhost:3000';
    assert.equal(getCognitoConfig().appOrigin, 'http://localhost:3000');
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.throws(() => getCognitoConfig());
    delete process.env.ADMIN_APP_ORIGIN;
    assert.throws(() => getCognitoConfig());
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else Object.assign(process.env, { [name]: value });
    }
  }
});

test('sealed cookie hides token material and rejects tampering or swapping', async () => {
  const sealed = await sealCognitoCookie(
    'refresh-token',
    'durable-refresh-token',
    sessionKey,
    60,
    1_000
  );

  assert.equal(sealed.includes('durable-refresh-token'), false);
  assert.equal(
    await unsealCognitoCookie(
      sealed,
      'refresh-token',
      sessionKey,
      new Date(1_010_000)
    ),
    'durable-refresh-token'
  );
  assert.equal(
    await unsealCognitoCookie(
      sealed,
      'access-token',
      sessionKey,
      new Date(1_010_000)
    ),
    null
  );

  const segments = sealed.split('.');
  assert.equal(segments.length, 5);
  const ciphertext = segments[3]!;
  const replacement = ciphertext.startsWith('A') ? 'B' : 'A';
  segments[3] = `${replacement}${ciphertext.slice(1)}`;
  const tampered = segments.join('.');
  assert.equal(
    await unsealCognitoCookie(
      tampered,
      'refresh-token',
      sessionKey,
      new Date(1_010_000)
    ),
    null
  );
  assert.equal(
    await unsealCognitoCookie(
      sealed,
      'refresh-token',
      sessionKey,
      new Date(1_061_000)
    ),
    null
  );
});

test('production cookie contract is host-only, HttpOnly, Secure, and SameSite', () => {
  assert.deepEqual(cognitoCookieOptions(true), {
    httpOnly: true,
    path: '/',
    priority: 'high',
    sameSite: 'lax',
    secure: true,
  });
  assert.equal('domain' in cognitoCookieOptions(true), false);
});

test('return paths stay on the configured application origin', () => {
  assert.equal(
    safeReturnTo('/reflexions/new?draft=1', config),
    '/reflexions/new?draft=1'
  );
  assert.equal(safeReturnTo('https://evil.example.invalid/', config), '/');
  assert.equal(safeReturnTo('//evil.example.invalid/', config), '/');
  assert.equal(safeReturnTo('\\\\evil.example.invalid/', config), '/');
  assert.equal(safeReturnTo('/auth/login', config), '/');
});

test('state-changing requests require exact origin and JSON where applicable', () => {
  const valid = new Request('https://admin.example.invalid/api/aws/posts', {
    method: 'POST',
    headers: {
      origin: 'https://admin.example.invalid',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json; charset=utf-8',
    },
  });
  assert.equal(isSameOriginMutation(valid, config), true);
  assert.equal(isJsonRequest(valid), true);

  const crossOrigin = new Request(
    'https://admin.example.invalid/api/aws/posts',
    {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.invalid',
        'sec-fetch-site': 'cross-site',
        'content-type': 'text/plain',
      },
    }
  );
  assert.equal(isSameOriginMutation(crossOrigin, config), false);
  assert.equal(isJsonRequest(crossOrigin), false);
});
