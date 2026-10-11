import { requireUserManagement } from '../auth';
import type { RouteHandler } from '../context';
import { validation } from '../errors';
import { parseBody, recordBody, response } from '../http';
import type { UserAction } from '../users';

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ACTIONS: readonly UserAction[] = [
  'resend-invitation',
  'reset-password',
  'enable',
  'disable',
  'revoke-sessions',
];

const listUsers: RouteHandler = async context => {
  const users = requireUserManagement(context);
  const { event, requestId } = context;
  const cursor = event.queryStringParameters?.cursor;
  if (
    cursor &&
    (cursor.length > 4096 || !/^[A-Za-z0-9_+=/.-]+$/.test(cursor))
  ) {
    throw validation('cursor', 'INVALID_CURSOR', 'Invalid page cursor');
  }
  return response(200, { data: await users.list(cursor) }, requestId);
};

const inviteUser: RouteHandler = async context => {
  const users = requireUserManagement(context);
  const { event, requestId, logger } = context;
  const body = recordBody(parseBody(event));
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw validation(
      'email',
      'INVALID_EMAIL',
      'A valid email address is required'
    );
  }
  const user = await users.invite(email);
  logger.info({
    message: 'cognito_user_action',
    action: 'invite',
    outcome: 'success',
    requestId,
  });
  return response(201, { data: { user } }, requestId);
};

const actOnUser: RouteHandler = async context => {
  const users = requireUserManagement(context);
  const { event, requestId, logger, admin } = context;
  const username = event.pathParameters?.username ?? '';
  if (!USERNAME_PATTERN.test(username)) {
    throw validation('username', 'INVALID_USERNAME', 'Invalid user identifier');
  }
  const body = recordBody(parseBody(event));
  const action = body.action;
  if (!USER_ACTIONS.includes(action as UserAction)) {
    throw validation('action', 'INVALID_ACTION', 'Unsupported user action');
  }
  await users.act(username, action as UserAction, admin.subject);
  logger.info({
    message: 'cognito_user_action',
    action,
    outcome: 'success',
    requestId,
  });
  return response(200, { data: { completed: true } }, requestId);
};

export const userRoutes = {
  'GET /users': listUsers,
  'POST /users': inviteUser,
  'POST /users/{username}/actions': actOnUser,
} satisfies Record<string, RouteHandler>;
