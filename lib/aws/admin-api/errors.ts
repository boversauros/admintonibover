type ValidationIssue = { path: string; code: string; message: string };

export class ApiValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';

  constructor(readonly issues: ValidationIssue[]) {
    super('Request validation failed');
    this.name = 'ApiValidationError';
  }
}

export class ApiUnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
}

export class ApiForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
}

export class ApiConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiConflictError';
    this.code = code;
  }
}

export function validation(
  path: string,
  code: string,
  message: string
): ApiValidationError {
  return new ApiValidationError([{ path, code, message }]);
}
