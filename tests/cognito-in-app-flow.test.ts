import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import type { CognitoConfig } from '../lib/auth/cognito/config';
import {
  COGNITO_COOKIE_NAMES,
  readNewPasswordChallengeCookie,
} from '../lib/auth/cognito/cookies';
import {
  compliantPassword,
  handleConfirmPassword,
  handleForgotPassword,
  handleInAppSignIn,
  handleInAppSignOut,
  handleNewPassword,
  type InAppAuthDependencies,
} from '../lib/auth/cognito/in-app-flow';

const config: CognitoConfig = {
  apiUrl: 'https://api.example.invalid',
  callbackUrl: 'https://admin.example.invalid/auth/callback',
  clientId: 'public-client',
  hostedAdminScope: 'admintonibover-api/admin',
  issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_example',
  loginUrl: 'https://login.example.invalid',
  logoutUrl: 'https://admin.example.invalid/',
  region: 'eu-west-1',
};

const tokens = {
  accessToken: 'sensitive-access',
  idToken: 'sensitive-id',
  refreshToken: 'sensitive-refresh',
  expiresIn: 900,
};

const dependencies: InAppAuthDependencies = {
  async signIn() {
    return { type: 'authenticated', tokens };
  },
  async completeChallenge() {
    return tokens;
  },
  async requestReset() {},
  async confirmReset() {},
  async verifyTokens() {},
};

function request(
  path: string,
  body: unknown,
  origin = 'https://admin.example.invalid'
) {
  return new NextRequest(`https://admin.example.invalid${path}`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

test('password authentication returns only safe state and encrypted host-only cookies', async () => {
  const previous = process.env.AWS_COGNITO_SESSION_SECRET;
  process.env.AWS_COGNITO_SESSION_SECRET = Buffer.alloc(32, 8).toString(
    'base64url'
  );
  try {
    const response = await handleInAppSignIn(
      request('/auth/login', {
        email: 'editor@example.invalid',
        password: 'private',
        returnTo: '//evil.example/',
      }),
      config,
      dependencies
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'authenticated',
      returnTo: '/',
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const headers = response.headers.get('set-cookie') ?? '';
    assert.equal(headers.includes('sensitive-access'), false);
    assert.equal(headers.includes('sensitive-refresh'), false);
    assert.match(headers, /HttpOnly/);
    assert.equal(headers.includes('Domain='), false);
    const refreshCookie = response.cookies.get(
      COGNITO_COOKIE_NAMES.refreshToken
    );
    assert.ok(refreshCookie);
    assert.equal(refreshCookie.value.length > 30, true);
  } finally {
    if (previous === undefined) delete process.env.AWS_COGNITO_SESSION_SECRET;
    else process.env.AWS_COGNITO_SESSION_SECRET = previous;
  }
});

test('unknown user and bad password are indistinguishable, and cross-origin requests are rejected', async () => {
  const failures: InAppAuthDependencies = {
    ...dependencies,
    async signIn(_config, email) {
      throw new Error(
        email === 'unknown@example.invalid'
          ? 'UserNotFoundException'
          : 'NotAuthorizedException'
      );
    },
  };
  const outcomes = await Promise.all(
    ['unknown@example.invalid', 'editor@example.invalid'].map(email =>
      handleInAppSignIn(
        request('/auth/login', { email, password: 'wrong' }),
        config,
        failures
      )
    )
  );
  const unknownError = await outcomes[0].json();
  assert.deepEqual(unknownError, await outcomes[1].json());
  assert.match(unknownError.error, /No s’ha pogut iniciar sessió/);
  assert.equal(outcomes[0].status, outcomes[1].status);
  assert.equal(outcomes[0].headers.get('cache-control'), 'no-store');
  const crossOrigin = await handleInAppSignIn(
    request(
      '/auth/login',
      { email: 'editor@example.invalid', password: 'private' },
      'https://evil.example'
    ),
    config,
    dependencies
  );
  assert.equal(crossOrigin.status, 403);
  const oversized = await handleInAppSignIn(
    request('/auth/login', {
      email: 'editor@example.invalid',
      password: 'a'.repeat(5000),
    }),
    config,
    dependencies
  );
  assert.equal(oversized.status, 400);
});

test('first-login challenge stays encrypted in a short-lived HttpOnly cookie', async () => {
  const previous = process.env.AWS_COGNITO_SESSION_SECRET;
  process.env.AWS_COGNITO_SESSION_SECRET = Buffer.alloc(32, 9).toString(
    'base64url'
  );
  try {
    const challengeDeps: InAppAuthDependencies = {
      ...dependencies,
      async signIn() {
        return {
          type: 'challenge',
          challengeName: 'NEW_PASSWORD_REQUIRED',
          challengeParameters: { USER_ID_FOR_SRP: 'internal-user' },
          session: 'sensitive-challenge',
        };
      },
      async completeChallenge(_config, username, session, password) {
        assert.deepEqual(
          [username, session, password],
          ['internal-user', 'sensitive-challenge', 'CompliantPassword1!']
        );
        return tokens;
      },
    };
    const start = await handleInAppSignIn(
      request('/auth/login', {
        email: 'editor@example.invalid',
        password: 'temporary',
        returnTo: '/reflexions/new',
      }),
      config,
      challengeDeps
    );
    assert.deepEqual(await start.json(), { status: 'new-password-required' });
    const cookie = start.cookies.get(COGNITO_COOKIE_NAMES.newPasswordChallenge);
    assert.ok(cookie);
    assert.equal(
      (start.headers.get('set-cookie') ?? '').includes('sensitive-challenge'),
      false
    );
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.maxAge, 300);
    assert.deepEqual(await readNewPasswordChallengeCookie(cookie.value), {
      username: 'internal-user',
      session: 'sensitive-challenge',
      returnTo: '/reflexions/new',
    });
    const finish = await handleNewPassword(
      request('/auth/new-password', { password: 'CompliantPassword1!' }),
      config,
      cookie.value,
      challengeDeps
    );
    assert.deepEqual(await finish.json(), {
      status: 'authenticated',
      returnTo: '/reflexions/new',
    });
    assert.equal(
      finish.cookies.get(COGNITO_COOKIE_NAMES.newPasswordChallenge)?.maxAge,
      0
    );
    const missing = await handleNewPassword(
      request('/auth/new-password', { password: 'CompliantPassword1!' }),
      config,
      undefined,
      challengeDeps
    );
    assert.equal(missing.status, 401);
  } finally {
    if (previous === undefined) delete process.env.AWS_COGNITO_SESSION_SECRET;
    else process.env.AWS_COGNITO_SESSION_SECRET = previous;
  }
});

test('recovery request masks Cognito user existence and confirmation needs valid password', async () => {
  const failing: InAppAuthDependencies = {
    ...dependencies,
    async requestReset() {
      throw new Error('UserNotFoundException');
    },
  };
  const [known, unknown] = await Promise.all([
    handleForgotPassword(
      request('/auth/forgot-password', { email: 'known@example.invalid' }),
      config,
      dependencies
    ),
    handleForgotPassword(
      request('/auth/forgot-password', { email: 'unknown@example.invalid' }),
      config,
      failing
    ),
  ]);
  assert.equal(known.status, 200);
  const recoveryMessage = await known.json();
  assert.deepEqual(recoveryMessage, await unknown.json());
  assert.match(recoveryMessage.message, /s’ha enviat un codi/);
  assert.equal(compliantPassword('weak'), false);
  assert.equal(compliantPassword('CompliantPassword1!'), true);
  const rejected = await handleConfirmPassword(
    request('/auth/confirm-password', {
      email: 'editor@example.invalid',
      code: '123456',
      password: 'weak',
    }),
    config,
    dependencies
  );
  assert.equal(rejected.status, 400);
  const accepted = await handleConfirmPassword(
    request('/auth/confirm-password', {
      email: 'editor@example.invalid',
      code: '123456',
      password: 'CompliantPassword1!',
    }),
    config,
    dependencies
  );
  assert.deepEqual(await accepted.json(), { status: 'password-reset' });
});

test('logout revokes refresh and clears every cookie without a managed-login URL', async () => {
  let revoked = '';
  const response = await handleInAppSignOut(
    request('/auth/logout', {}),
    config,
    'sensitive-refresh',
    async (_config, token) => {
      revoked = token;
    }
  );
  assert.equal(revoked, 'sensitive-refresh');
  assert.deepEqual(await response.json(), { status: 'signed-out' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const name of Object.values(COGNITO_COOKIE_NAMES)) {
    assert.equal(response.cookies.get(name)?.maxAge, 0);
  }
  const rejected = await handleInAppSignOut(
    request('/auth/logout', {}, 'https://evil.example'),
    config,
    'sensitive-refresh',
    async () => {
      throw new Error('Must not revoke cross-origin');
    }
  );
  assert.equal(rejected.status, 403);
});
