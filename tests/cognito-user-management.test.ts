import assert from 'node:assert/strict';
import test from 'node:test';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import {
  CognitoUserManagement,
  UserManagementError,
} from '../lib/aws/admin-api/users';

type SentCommand = {
  constructor: { name: string };
  input: Record<string, unknown>;
};

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: SentCommand[] = [];
  const client = {
    async send(command: SentCommand) {
      calls.push(command);
      if (command.constructor.name === 'AdminCreateUserCommand') {
        return { User: { Username: 'cognito-private-username' } };
      }
      if (command.constructor.name === 'ListUsersCommand') {
        return {
          Users: [
            {
              Username: 'cognito-private-username',
              Attributes: [
                { Name: 'sub', Value: 'user-subject' },
                { Name: 'email', Value: 'editor@example.test' },
                { Name: 'email_verified', Value: 'true' },
              ],
              UserStatus: 'CONFIRMED',
              Enabled: true,
            },
          ],
          PaginationToken: 'next-page',
        };
      }
      if (command.constructor.name === 'AdminListGroupsForUserCommand') {
        return { Groups: [{ GroupName: 'editors' }] };
      }
      if (command.constructor.name === 'AdminGetUserCommand') {
        return {
          Username: 'cognito-private-username',
          UserStatus: 'FORCE_CHANGE_PASSWORD',
          Enabled: true,
          UserAttributes: [
            { Name: 'sub', Value: 'user-subject' },
            { Name: 'email_verified', Value: 'true' },
          ],
          ...overrides,
        };
      }
      return {};
    },
  } as unknown as CognitoIdentityProviderClient;
  return {
    users: new CognitoUserManagement('eu-west-1_private-pool', client),
    calls,
  };
}

test('invitation assigns editor before sending email and never passes a password', async () => {
  const { users, calls } = fixture();
  const invited = await users.invite('editor@example.test');
  assert.equal(invited.username, 'cognito-private-username');
  assert.deepEqual(invited.groups, ['editors']);
  assert.deepEqual(
    calls.map(call => call.constructor.name),
    [
      'AdminCreateUserCommand',
      'AdminAddUserToGroupCommand',
      'AdminCreateUserCommand',
    ]
  );
  assert.equal(calls[0].input.MessageAction, 'SUPPRESS');
  assert.equal(calls[1].input.Username, 'cognito-private-username');
  assert.equal(calls[1].input.GroupName, 'editors');
  assert.equal(calls[2].input.MessageAction, 'RESEND');
  assert.equal(
    calls.every(call => !('TemporaryPassword' in call.input)),
    true
  );
});

test('failed editor assignment never sends an invitation', async () => {
  const calls: string[] = [];
  const client = {
    async send(command: SentCommand) {
      calls.push(command.constructor.name);
      if (command.constructor.name === 'AdminCreateUserCommand') {
        return { User: { Username: 'cognito-private-username' } };
      }
      throw new Error('group assignment unavailable');
    },
  } as unknown as CognitoIdentityProviderClient;
  const users = new CognitoUserManagement('eu-west-1_private-pool', client);
  await assert.rejects(
    () => users.invite('editor@example.test'),
    (error: unknown) =>
      error instanceof UserManagementError &&
      error.code === 'INVITATION_INCOMPLETE'
  );
  assert.deepEqual(calls, [
    'AdminCreateUserCommand',
    'AdminAddUserToGroupCommand',
  ]);
});

test('list returns status, role and pagination without credentials', async () => {
  const { users, calls } = fixture();
  const page = await users.list('current-page');
  assert.equal(page.nextCursor, 'next-page');
  assert.deepEqual(page.items[0], {
    username: 'cognito-private-username',
    subject: 'user-subject',
    email: 'editor@example.test',
    status: 'CONFIRMED',
    enabled: true,
    emailVerified: true,
    groups: ['editors'],
    createdAt: null,
  });
  assert.equal(calls[0].input.PaginationToken, 'current-page');
});

test('self-disable is rejected before any mutation', async () => {
  const { users, calls } = fixture();
  await assert.rejects(
    () => users.act('cognito-private-username', 'disable', 'user-subject'),
    (error: unknown) =>
      error instanceof UserManagementError &&
      error.code === 'SELF_DISABLE_FORBIDDEN'
  );
  assert.deepEqual(
    calls.map(call => call.constructor.name),
    ['AdminGetUserCommand']
  );
});

test('disable revokes sessions, and expired invitation can be resent', async () => {
  const { users, calls } = fixture();
  await users.act('cognito-private-username', 'disable', 'admin-subject');
  assert.deepEqual(
    calls.map(call => call.constructor.name),
    [
      'AdminGetUserCommand',
      'AdminDisableUserCommand',
      'AdminUserGlobalSignOutCommand',
    ]
  );
  calls.length = 0;
  await users.act(
    'cognito-private-username',
    'resend-invitation',
    'admin-subject'
  );
  assert.deepEqual(
    calls.map(call => call.constructor.name),
    [
      'AdminGetUserCommand',
      'AdminListGroupsForUserCommand',
      'AdminCreateUserCommand',
    ]
  );
  assert.equal(calls[2].input.MessageAction, 'RESEND');
});

test('password reset uses Cognito recovery without exposing a code', async () => {
  const { users, calls } = fixture();
  await users.act(
    'cognito-private-username',
    'reset-password',
    'admin-subject'
  );
  assert.equal(calls.at(-1)?.constructor.name, 'AdminResetUserPasswordCommand');
});
