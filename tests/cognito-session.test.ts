import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCognitoConfig,
  type CognitoConfig,
} from '../lib/auth/cognito/config';
import { cognitoCookieOptions } from '../lib/auth/cognito/cookies';
import {
  buildManagedLogoutUrl,
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
  callbackUrl: 'https://admin.example.invalid/auth/callback',
  clientId: 'public-client',
  issuer: 'https://issuer.example.invalid/pool',
  loginUrl: 'https://login.example.invalid',
  logoutUrl: 'https://admin.example.invalid/',
  requiredScope: 'admintonibover-api/admin',
};

const sessionSecret = Buffer.alloc(32, 7).toString('base64url');
const sessionKey = parseCognitoSessionSecret(sessionSecret);

test('session secret is exactly 32 bytes of unpadded base64url', () => {
  assert.equal(sessionKey.length, 32);
  assert.throws(() => parseCognitoSessionSecret(undefined));
  assert.throws(() => parseCognitoSessionSecret('too-short'));
  assert.throws(() => parseCognitoSessionSecret(`${sessionSecret}=`));
});

test('AWS configuration requires exact same-origin callback and logout paths', () => {
  const names = [
    'AWS_ADMIN_API_URL',
    'AWS_COGNITO_CALLBACK_URL',
    'AWS_COGNITO_CLIENT_ID',
    'AWS_COGNITO_ISSUER',
    'AWS_COGNITO_LOGIN_URL',
    'AWS_COGNITO_LOGOUT_URL',
    'AWS_COGNITO_SESSION_SECRET',
    'NODE_ENV',
  ] as const;
  const previous = Object.fromEntries(
    names.map(name => [name, process.env[name]])
  );
  Object.assign(process.env, {
    AWS_ADMIN_API_URL: config.apiUrl,
    AWS_COGNITO_CALLBACK_URL: config.callbackUrl,
    AWS_COGNITO_CLIENT_ID: config.clientId,
    AWS_COGNITO_ISSUER: config.issuer,
    AWS_COGNITO_LOGIN_URL: config.loginUrl,
    AWS_COGNITO_LOGOUT_URL: config.logoutUrl,
    AWS_COGNITO_SESSION_SECRET: sessionSecret,
  });

  try {
    assert.deepEqual(getCognitoConfig(), config);
    process.env.AWS_COGNITO_CALLBACK_URL = 'https://admin.example.invalid/';
    assert.throws(() => getCognitoConfig());
    process.env.AWS_COGNITO_CALLBACK_URL = config.callbackUrl;
    process.env.AWS_COGNITO_LOGOUT_URL =
      'https://admin.example.invalid/signed-out';
    assert.throws(() => getCognitoConfig());
    process.env.AWS_COGNITO_LOGOUT_URL = 'https://different.example.invalid/';
    assert.throws(() => getCognitoConfig());
    process.env.AWS_COGNITO_CALLBACK_URL =
      'https://*.example.invalid/auth/callback';
    process.env.AWS_COGNITO_LOGOUT_URL = 'https://*.example.invalid/';
    assert.throws(() => getCognitoConfig());
    Object.assign(process.env, { NODE_ENV: 'production' });
    process.env.AWS_COGNITO_CALLBACK_URL =
      'http://localhost:3000/auth/callback';
    process.env.AWS_COGNITO_LOGOUT_URL = 'http://localhost:3000/';
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
  assert.equal(safeReturnTo('/auth/callback', config), '/');
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

test('managed logout uses only the public client and exact allow-listed URL', () => {
  const logout = new URL(buildManagedLogoutUrl(config));
  assert.equal(logout.origin, config.loginUrl);
  assert.equal(logout.pathname, '/logout');
  assert.equal(logout.searchParams.get('client_id'), config.clientId);
  assert.equal(logout.searchParams.get('logout_uri'), config.logoutUrl);
  assert.equal(logout.searchParams.has('token'), false);
});
