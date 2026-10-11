import {
  belongsToAnyCognitoGroup,
  canManageCognitoUsers,
  parseCognitoGroups,
} from '@/lib/auth/cognito/groups';

import type {
  AdminApiDependencies,
  AdminApiEvent,
  AuthenticatedAdmin,
  RouteContext,
} from './context';
import { ApiForbiddenError, ApiUnauthorizedError } from './errors';
import type { UserManagement } from './users';

export function authenticate(
  event: AdminApiEvent,
  security: AdminApiDependencies['security']
): AuthenticatedAdmin {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  const clientId = claims.client_id ?? claims.aud;
  if (
    claims.iss !== security.issuer ||
    clientId !== security.clientId ||
    claims.token_use !== 'access' ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0
  ) {
    throw new ApiUnauthorizedError('Authentication claims are invalid');
  }
  const groups = parseCognitoGroups(claims['cognito:groups']);
  if (!belongsToAnyCognitoGroup(groups, security.allowedGroups)) {
    throw new ApiForbiddenError('Content access is required');
  }
  return { groups, subject: claims.sub };
}

/** Super-admin gate for user routes; checked before any input validation. */
export function requireUserManagement({
  admin,
  dependencies,
}: RouteContext): UserManagement {
  if (!canManageCognitoUsers(admin.groups)) {
    throw new ApiForbiddenError('User management requires super-admin access');
  }
  if (!dependencies.users) throw new Error('User management is unavailable');
  return dependencies.users;
}
