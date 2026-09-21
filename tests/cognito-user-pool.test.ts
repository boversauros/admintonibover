import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GetUserCommand,
  InitiateAuthCommand,
  RevokeTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import type { CognitoConfig } from '../lib/auth/cognito/config';
import {
  belongsToAnyCognitoGroup,
  canManageCognitoUsers,
  COGNITO_GROUPS,
  CONTENT_OPERATION_GROUPS,
  parseCognitoGroups,
} from '../lib/auth/cognito/groups';
import {
  refreshCognitoTokens,
  revokeCognitoRefreshToken,
  signInCognitoUser,
  verifyCognitoTokenActive,
  type CognitoCommandSender,
  type CognitoUserPoolCommand,
} from '../lib/auth/cognito/user-pool';

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

function sender(
  implementation: (command: CognitoUserPoolCommand) => unknown
): CognitoCommandSender {
  return async (command, options) => {
    assert.equal(options.abortSignal.aborted, false);
    return implementation(command);
  };
}

test('Cognito group claims normalize JWT and API Gateway representations', () => {
  assert.deepEqual(parseCognitoGroups(['super-admins', 'unknown']), [
    'super-admins',
  ]);
  assert.deepEqual(parseCognitoGroups('["editors"]'), ['editors']);
  assert.deepEqual(parseCognitoGroups('[super-admins, editors]'), [
    'super-admins',
    'editors',
  ]);
  assert.deepEqual(parseCognitoGroups(undefined), []);
  assert.equal(
    belongsToAnyCognitoGroup([COGNITO_GROUPS.editor], CONTENT_OPERATION_GROUPS),
    true
  );
  assert.equal(belongsToAnyCognitoGroup([], CONTENT_OPERATION_GROUPS), false);
  assert.equal(canManageCognitoUsers([COGNITO_GROUPS.superAdmin]), true);
  assert.equal(canManageCognitoUsers([COGNITO_GROUPS.editor]), false);
});

test('password sign-in uses the public USER_PASSWORD_AUTH flow', async () => {
  const result = await signInCognitoUser(
    config,
    ' admin@example.invalid ',
    'private-password',
    sender(command => {
      assert.equal(command instanceof InitiateAuthCommand, true);
      if (!(command instanceof InitiateAuthCommand)) return {};
      assert.deepEqual(command.input, {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.clientId,
        AuthParameters: {
          USERNAME: 'admin@example.invalid',
          PASSWORD: 'private-password',
        },
      });
      assert.equal(command.input.AuthParameters?.SECRET_HASH, undefined);
      return {
        AuthenticationResult: {
          AccessToken: 'access-token',
          ExpiresIn: 900,
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
          TokenType: 'Bearer',
        },
      };
    })
  );

  assert.deepEqual(result, {
    type: 'authenticated',
    tokens: {
      accessToken: 'access-token',
      expiresIn: 900,
      idToken: 'id-token',
      refreshToken: 'refresh-token',
    },
  });
});

test('password sign-in preserves a first-login challenge for the in-app flow', async () => {
  const result = await signInCognitoUser(
    config,
    'editor@example.invalid',
    'temporary-password',
    sender(() => ({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ChallengeParameters: {
        USER_ID_FOR_SRP: 'internal-user',
        unexpected: 42,
      },
      Session: 'challenge-session',
    }))
  );

  assert.deepEqual(result, {
    type: 'challenge',
    challengeName: 'NEW_PASSWORD_REQUIRED',
    challengeParameters: { USER_ID_FOR_SRP: 'internal-user' },
    session: 'challenge-session',
  });
});

test('refresh uses REFRESH_TOKEN_AUTH without a client secret', async () => {
  const tokens = await refreshCognitoTokens(
    config,
    'refresh-token',
    sender(command => {
      assert.equal(command instanceof InitiateAuthCommand, true);
      if (!(command instanceof InitiateAuthCommand)) return {};
      assert.deepEqual(command.input, {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: config.clientId,
        AuthParameters: { REFRESH_TOKEN: 'refresh-token' },
      });
      return {
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          ExpiresIn: 900,
          IdToken: 'new-id-token',
          TokenType: 'Bearer',
        },
      };
    })
  );

  assert.deepEqual(tokens, {
    accessToken: 'new-access-token',
    expiresIn: 900,
    idToken: 'new-id-token',
    refreshToken: undefined,
  });
});

test('GetUser verifies the active subject and revocation targets the public client', async () => {
  await verifyCognitoTokenActive(
    config,
    'access-token',
    'admin-subject',
    sender(command => {
      assert.equal(command instanceof GetUserCommand, true);
      if (!(command instanceof GetUserCommand)) return {};
      assert.deepEqual(command.input, { AccessToken: 'access-token' });
      return {
        UserAttributes: [{ Name: 'sub', Value: 'admin-subject' }],
      };
    })
  );

  await assert.rejects(() =>
    verifyCognitoTokenActive(
      config,
      'access-token',
      'admin-subject',
      sender(() => ({
        UserAttributes: [{ Name: 'sub', Value: 'different-subject' }],
      }))
    )
  );

  await revokeCognitoRefreshToken(
    config,
    'refresh-token',
    sender(command => {
      assert.equal(command instanceof RevokeTokenCommand, true);
      if (!(command instanceof RevokeTokenCommand)) return {};
      assert.deepEqual(command.input, {
        ClientId: config.clientId,
        Token: 'refresh-token',
      });
      return {};
    })
  );
});
