import assert from 'node:assert/strict';
import test from 'node:test';

import type { CognitoConfig } from '../lib/auth/cognito/config';
import {
  accessTokenNeedsRefresh,
  validateCognitoClaims,
} from '../lib/auth/cognito/tokens';

const config: CognitoConfig = {
  apiUrl: 'https://api.example.invalid',
  appOrigin: 'https://admin.example.invalid',
  clientId: 'public-client',
  issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_example',
  region: 'eu-west-1',
};

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url'
  );
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('session claims validate token identity and project Cognito groups', () => {
  const access = {
    iss: config.issuer,
    token_use: 'access',
    client_id: config.clientId,
    scope: 'aws.cognito.signin.user.admin',
    'cognito:groups': ['super-admins'],
    sub: 'admin-subject',
    exp: 2_000_000_000,
  };
  const identity = {
    iss: config.issuer,
    aud: config.clientId,
    token_use: 'id',
    sub: 'admin-subject',
    email: 'admin@example.invalid',
    email_verified: true,
  };

  assert.deepEqual(validateCognitoClaims(config, access, identity), {
    accessExpiresAt: 2_000_000_000,
    user: {
      id: 'admin-subject',
      email: 'admin@example.invalid',
      groups: ['super-admins'],
    },
  });
  assert.deepEqual(
    validateCognitoClaims(
      config,
      { ...access, scope: undefined, 'cognito:groups': undefined },
      identity
    ).user.groups,
    []
  );
  assert.throws(() =>
    validateCognitoClaims(config, access, {
      ...identity,
      email_verified: false,
    })
  );
  assert.throws(() =>
    validateCognitoClaims(
      config,
      { ...access, iss: 'https://wrong-issuer.example.invalid' },
      identity
    )
  );
  assert.throws(() =>
    validateCognitoClaims(config, access, { ...identity, aud: 'wrong-client' })
  );
  assert.throws(() =>
    validateCognitoClaims(config, access, {
      ...identity,
      sub: 'different-subject',
    })
  );
});

test('access tokens refresh before their final 30 seconds', () => {
  assert.equal(accessTokenNeedsRefresh(fakeJwt(1_030), 1_000), true);
  assert.equal(accessTokenNeedsRefresh(fakeJwt(1_031), 1_000), false);
});
