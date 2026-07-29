import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { CognitoConfig } from '../lib/auth/cognito/config';
import {
  accessTokenNeedsRefresh,
  createPkceArtifacts,
  exchangeAuthorizationCode,
  matchesState,
  refreshCognitoTokens,
  validateCognitoClaims,
} from '../lib/auth/cognito/oauth';
import { parseAdminDataBackend } from '../lib/config/adminBackend';

const config: CognitoConfig = {
  apiUrl: 'https://api.example.invalid',
  callbackUrl: 'https://admin.example.invalid/',
  clientId: 'public-client',
  issuer: 'https://issuer.example.invalid/pool',
  loginUrl: 'https://login.example.invalid',
  logoutUrl: 'https://admin.example.invalid/',
  requiredScope: 'admintonibover-api/admin',
};

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url'
  );
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('backend flag defaults to Supabase and rejects ambiguous values', () => {
  assert.equal(parseAdminDataBackend(undefined), 'supabase');
  assert.equal(parseAdminDataBackend(''), 'supabase');
  assert.equal(parseAdminDataBackend('aws'), 'aws');
  assert.throws(() => parseAdminDataBackend('AWS'));
});

test('PKCE authorization request binds verifier, state, nonce, and exact callback', () => {
  const artifacts = createPkceArtifacts(config);
  const authorizeUrl = new URL(artifacts.authorizeUrl);
  const expectedChallenge = createHash('sha256')
    .update(artifacts.verifier)
    .digest('base64url');

  assert.equal(authorizeUrl.origin, 'https://login.example.invalid');
  assert.equal(authorizeUrl.pathname, '/oauth2/authorize');
  assert.equal(authorizeUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizeUrl.searchParams.get('client_id'), 'public-client');
  assert.equal(
    authorizeUrl.searchParams.get('redirect_uri'),
    config.callbackUrl
  );
  assert.equal(
    authorizeUrl.searchParams.get('code_challenge'),
    expectedChallenge
  );
  assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizeUrl.searchParams.get('state'), artifacts.state);
  assert.equal(authorizeUrl.searchParams.get('nonce'), artifacts.nonce);
  assert.equal(authorizeUrl.searchParams.get('prompt'), 'login');
  assert.equal(matchesState(artifacts.state, artifacts.state), true);
  assert.equal(matchesState('wrong', artifacts.state), false);
});

test('authorization code exchange sends PKCE values without a client secret', async () => {
  let requestBody = '';
  const tokens = await exchangeAuthorizationCode(
    config,
    'authorization-code',
    'code-verifier',
    async (_input, init) => {
      requestBody = String(init?.body);
      return Response.json({
        access_token: 'access-token',
        id_token: 'id-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 900,
      });
    }
  );

  const parameters = new URLSearchParams(requestBody);
  assert.equal(parameters.get('grant_type'), 'authorization_code');
  assert.equal(parameters.get('code'), 'authorization-code');
  assert.equal(parameters.get('code_verifier'), 'code-verifier');
  assert.equal(parameters.get('client_id'), config.clientId);
  assert.equal(parameters.get('client_secret'), null);
  assert.deepEqual(tokens, {
    accessToken: 'access-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  });
});

test('refresh grant retains the public-client contract', async () => {
  let requestBody = '';
  await refreshCognitoTokens(config, 'refresh-token', async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({
      access_token: 'new-access-token',
      id_token: 'new-id-token',
      token_type: 'Bearer',
      expires_in: 900,
    });
  });

  const parameters = new URLSearchParams(requestBody);
  assert.equal(parameters.get('grant_type'), 'refresh_token');
  assert.equal(parameters.get('refresh_token'), 'refresh-token');
  assert.equal(parameters.get('client_id'), config.clientId);
  assert.equal(parameters.get('client_secret'), null);
});

test('session claims require access-token use, admin scope, nonce, and verified email', () => {
  const access = {
    token_use: 'access',
    client_id: config.clientId,
    scope: `openid ${config.requiredScope}`,
    exp: 2_000_000_000,
  };
  const identity = {
    token_use: 'id',
    sub: 'admin-subject',
    email: 'admin@example.invalid',
    email_verified: true,
    nonce: 'expected-nonce',
  };

  assert.deepEqual(
    validateCognitoClaims(config, access, identity, 'expected-nonce'),
    {
      accessExpiresAt: 2_000_000_000,
      user: {
        id: 'admin-subject',
        email: 'admin@example.invalid',
      },
    }
  );
  assert.throws(() =>
    validateCognitoClaims(config, access, identity, 'wrong-nonce')
  );
  assert.throws(() =>
    validateCognitoClaims(
      config,
      { ...access, scope: 'openid' },
      identity,
      'expected-nonce'
    )
  );
  assert.throws(() =>
    validateCognitoClaims(
      config,
      access,
      { ...identity, email_verified: false },
      'expected-nonce'
    )
  );
});

test('access tokens refresh before their final 30 seconds', () => {
  assert.equal(accessTokenNeedsRefresh(fakeJwt(1_030), 1_000), true);
  assert.equal(accessTokenNeedsRefresh(fakeJwt(1_031), 1_000), false);
});
