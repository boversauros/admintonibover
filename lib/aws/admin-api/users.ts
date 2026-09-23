import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminResetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import {
  COGNITO_GROUPS,
  parseCognitoGroups,
  type CognitoGroup,
} from '@/lib/auth/cognito/groups';

export type ManagedUser = {
  username: string;
  subject: string;
  email: string;
  status: string;
  enabled: boolean;
  emailVerified: boolean;
  groups: CognitoGroup[];
  createdAt: string | null;
};

export type UserAction =
  | 'resend-invitation'
  | 'reset-password'
  | 'enable'
  | 'disable'
  | 'revoke-sessions';

export class UserManagementError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'UserManagementError';
  }
}

export interface UserManagement {
  list(
    cursor?: string
  ): Promise<{ items: ManagedUser[]; nextCursor: string | null }>;
  invite(email: string): Promise<ManagedUser>;
  act(
    username: string,
    action: UserAction,
    actorSubject: string
  ): Promise<void>;
}

type CognitoClient = Pick<CognitoIdentityProviderClient, 'send'>;

function attribute(
  attributes: { Name?: string; Value?: string }[] | undefined,
  name: string
): string | undefined {
  return attributes?.find(item => item.Name === name)?.Value;
}

function isCognitoError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

export class CognitoUserManagement implements UserManagement {
  constructor(
    private readonly poolId: string,
    private readonly client: CognitoClient = new CognitoIdentityProviderClient(
      {}
    )
  ) {}

  private async groups(username: string): Promise<CognitoGroup[]> {
    const result = await this.client.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: this.poolId,
        Username: username,
        Limit: 20,
      })
    );
    return parseCognitoGroups(
      (result.Groups ?? []).map(group => group.GroupName).filter(Boolean)
    );
  }

  async list(cursor?: string) {
    const result = await this.client.send(
      new ListUsersCommand({
        UserPoolId: this.poolId,
        Limit: 25,
        ...(cursor ? { PaginationToken: cursor } : {}),
      })
    );
    const items: ManagedUser[] = [];
    const page = result.Users ?? [];
    for (let index = 0; index < page.length; index += 5) {
      const batch = await Promise.all(
        page.slice(index, index + 5).map(async user => ({
          username: user.Username ?? '',
          subject: attribute(user.Attributes, 'sub') ?? '',
          email: attribute(user.Attributes, 'email') ?? '',
          status: user.UserStatus ?? 'UNKNOWN',
          enabled: user.Enabled ?? false,
          emailVerified:
            attribute(user.Attributes, 'email_verified') === 'true',
          groups: await this.groups(user.Username ?? ''),
          createdAt: user.UserCreateDate?.toISOString() ?? null,
        }))
      );
      items.push(...batch);
    }
    return { items, nextCursor: result.PaginationToken ?? null };
  }

  async invite(email: string): Promise<ManagedUser> {
    let username: string;
    try {
      const created = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.poolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'SUPPRESS',
        })
      );
      username = created.User?.Username ?? '';
      if (!username) throw new Error('Cognito did not return a username');
    } catch (error) {
      if (
        isCognitoError(error, 'UsernameExistsException') ||
        isCognitoError(error, 'AliasExistsException')
      ) {
        throw new UserManagementError(
          'USER_EXISTS',
          409,
          'Aquest correu ja té un compte.'
        );
      }
      throw error;
    }

    // The invitation is intentionally sent only after the editor group exists.
    // A failed group assignment leaves a suppressed account, never an invited ungrouped user.
    try {
      await this.client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: this.poolId,
          Username: username,
          GroupName: COGNITO_GROUPS.editor,
        })
      );
    } catch {
      throw new UserManagementError(
        'INVITATION_INCOMPLETE',
        502,
        'El compte s’ha creat, però no s’ha pogut assignar el rol. Cal revisar-lo abans de convidar-lo.'
      );
    }
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.poolId,
          Username: username,
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'RESEND',
        })
      );
    } catch {
      throw new UserManagementError(
        'INVITATION_NOT_SENT',
        502,
        'El compte i el rol s’han creat, però no s’ha pogut enviar la invitació. Torna-la a enviar des de la llista.'
      );
    }
    return {
      username,
      subject: '',
      email,
      status: 'FORCE_CHANGE_PASSWORD',
      enabled: true,
      emailVerified: true,
      groups: [COGNITO_GROUPS.editor],
      createdAt: null,
    };
  }

  async act(
    username: string,
    action: UserAction,
    actorSubject: string
  ): Promise<void> {
    let user;
    try {
      user = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
    } catch (error) {
      if (isCognitoError(error, 'UserNotFoundException')) {
        throw new UserManagementError(
          'USER_NOT_FOUND',
          404,
          'No s’ha trobat aquest usuari.'
        );
      }
      throw error;
    }
    const subject = attribute(user.UserAttributes, 'sub');
    if (!subject) {
      throw new UserManagementError(
        'USER_IDENTITY_UNAVAILABLE',
        502,
        'No s’ha pogut verificar la identitat del compte.'
      );
    }
    if (action === 'disable' && subject === actorSubject) {
      throw new UserManagementError(
        'SELF_DISABLE_FORBIDDEN',
        409,
        'No pots desactivar el teu propi compte.'
      );
    }
    if (action === 'resend-invitation') {
      if (
        user.UserStatus !== 'FORCE_CHANGE_PASSWORD' ||
        user.Enabled === false
      ) {
        throw new UserManagementError(
          'NOT_PENDING_INVITATION',
          409,
          'Aquest usuari no té cap invitació pendent.'
        );
      }
      const groups = await this.groups(user.Username ?? username);
      if (!groups.includes(COGNITO_GROUPS.editor)) {
        throw new UserManagementError(
          'EDITOR_GROUP_REQUIRED',
          409,
          'Cal assignar primer el grup d’editors.'
        );
      }
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.poolId,
          Username: user.Username ?? username,
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'RESEND',
        })
      );
      return;
    }
    if (action === 'reset-password') {
      if (attribute(user.UserAttributes, 'email_verified') !== 'true') {
        throw new UserManagementError(
          'VERIFIED_EMAIL_REQUIRED',
          409,
          'Cal verificar el correu abans de restablir la contrasenya.'
        );
      }
      await this.client.send(
        new AdminResetUserPasswordCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
    } else if (action === 'enable') {
      await this.client.send(
        new AdminEnableUserCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
    } else if (action === 'disable') {
      await this.client.send(
        new AdminDisableUserCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
      await this.client.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
    } else {
      await this.client.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: this.poolId,
          Username: username,
        })
      );
    }
  }
}
