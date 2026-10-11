import {
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadIntegrityError,
  MediaUploadNotFoundError,
  MediaValidationError,
} from '@/lib/domain/media/errors';
import {
  PostAggregateTooLargeError,
  PostDataIntegrityError,
  PostNotFoundError,
  PostSlugConflictError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';

import { authenticate } from './auth';
import { AdminBackupTooLargeError } from './backup';
import type {
  AdminApiDependencies,
  AdminApiEvent,
  AdminApiResponse,
  AdminLogger,
} from './context';
import {
  ApiConflictError,
  ApiForbiddenError,
  ApiUnauthorizedError,
  ApiValidationError,
} from './errors';
import { correlationId, errorResponse, isRecord } from './http';
import { findRoute } from './routes';
import { AdminStoreConflictError, AdminStoreNotFoundError } from './store';
import { UserManagementError } from './users';

export type {
  AdminApiDependencies,
  AdminApiEvent,
  AdminApiResponse,
} from './context';

const NOOP_LOGGER: AdminLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function isThrottled(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return [
    'ThrottlingException',
    'ProvisionedThroughputExceededException',
    'RequestLimitExceeded',
    'TooManyRequestsException',
  ].includes(String(error.name));
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : 'UnknownError';
}

function mappedError(
  error: unknown,
  requestId: string,
  logger: AdminLogger,
  routeKey: string
): AdminApiResponse {
  if (error instanceof UserManagementError) {
    logger.warn({
      message: 'cognito_user_action_failed',
      requestId,
      routeKey,
      code: error.code,
    });
    return errorResponse(error.status, error.code, error.message, requestId);
  }
  if (error instanceof ApiValidationError) {
    const first = error.issues[0];
    const tooLarge = first?.code === 'BODY_TOO_LARGE';
    return errorResponse(
      tooLarge ? 413 : 400,
      first?.code ?? error.code,
      first?.message ?? error.message,
      requestId
    );
  }
  if (error instanceof MediaValidationError) {
    const first = error.issues[0];
    const tooLarge =
      first?.code === 'BODY_TOO_LARGE' || first?.code === 'INVALID_IMAGE_SIZE';
    return errorResponse(
      tooLarge ? 413 : 400,
      first?.code ?? error.code,
      first?.message ?? error.message,
      requestId
    );
  }
  if (error instanceof ApiUnauthorizedError) {
    return errorResponse(401, error.code, 'Sign-in required', requestId);
  }
  if (error instanceof ApiForbiddenError) {
    return errorResponse(403, error.code, 'Access denied', requestId);
  }
  if (
    error instanceof PostNotFoundError ||
    error instanceof AdminStoreNotFoundError ||
    error instanceof MediaUploadNotFoundError
  ) {
    return errorResponse(404, 'NOT_FOUND', 'Resource not found', requestId);
  }
  if (error instanceof AdminStoreConflictError) {
    const conflict = {
      version: {
        code: 'VERSION_CONFLICT',
        message: 'The resource was changed by another operation',
      },
      idempotency: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key is already in use',
      },
      backup: {
        code: 'BACKUP_CHANGED_DURING_EXPORT',
        message: 'Data changed during backup; retry the download',
      },
    }[error.reason];
    return errorResponse(409, conflict.code, conflict.message, requestId);
  }
  if (
    error instanceof PostVersionConflictError ||
    error instanceof PostSlugConflictError ||
    error instanceof MediaUploadConflictError ||
    error instanceof ApiConflictError
  ) {
    return errorResponse(409, error.code, error.message, requestId);
  }
  if (error instanceof MediaUploadExpiredError) {
    return errorResponse(410, error.code, error.message, requestId);
  }
  if (error instanceof MediaUploadIntegrityError) {
    return errorResponse(400, error.code, error.message, requestId);
  }
  if (
    error instanceof PostAggregateTooLargeError ||
    error instanceof AdminBackupTooLargeError
  ) {
    return errorResponse(413, error.code, error.message, requestId);
  }
  if (isThrottled(error)) {
    return errorResponse(
      429,
      'THROTTLED',
      'The service is busy; retry later',
      requestId,
      { 'retry-after': '1' }
    );
  }
  logger.error({
    message: 'admin_api_request_failed',
    requestId,
    routeKey,
    errorName: safeErrorName(error),
    dataIntegrityFailure: error instanceof PostDataIntegrityError,
  });
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'The request could not be completed',
    requestId
  );
}

export function createAdminApiHandler(dependencies: AdminApiDependencies) {
  const clock = dependencies.clock ?? (() => new Date());
  const logger = dependencies.logger ?? NOOP_LOGGER;

  return async function handler(
    event: AdminApiEvent
  ): Promise<AdminApiResponse> {
    const requestId = correlationId(event);
    const routeKey = event.routeKey ?? '';
    try {
      // Authenticate before routing so unknown routes never leak a 404 to
      // unauthenticated callers.
      const admin = authenticate(event, dependencies.security);
      const route = findRoute(routeKey);
      if (!route) {
        return errorResponse(404, 'NOT_FOUND', 'Route not found', requestId);
      }
      return await route({
        event,
        routeKey,
        requestId,
        admin,
        dependencies,
        clock,
        logger,
      });
    } catch (error) {
      return mappedError(error, requestId, logger, routeKey);
    }
  };
}
