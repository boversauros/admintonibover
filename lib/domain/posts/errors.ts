import type { PostLanguage } from './types';

export type PostValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class PostValidationError extends Error {
  readonly code = 'POST_VALIDATION_FAILED';

  constructor(readonly issues: PostValidationIssue[]) {
    super('Post validation failed');
    this.name = 'PostValidationError';
  }
}

export class PostNotFoundError extends Error {
  readonly code = 'POST_NOT_FOUND';

  constructor(readonly postId: string) {
    super('Post not found');
    this.name = 'PostNotFoundError';
  }
}

export class PostVersionConflictError extends Error {
  readonly code = 'POST_VERSION_CONFLICT';

  constructor(
    readonly postId: string,
    readonly expectedVersion: number
  ) {
    super('The post was changed by another operation');
    this.name = 'PostVersionConflictError';
  }
}

export class PostSlugConflictError extends Error {
  readonly code = 'POST_SLUG_CONFLICT';

  constructor(readonly language: PostLanguage) {
    super(`The ${language} slug is already in use`);
    this.name = 'PostSlugConflictError';
  }
}

export class PostAggregateTooLargeError extends Error {
  readonly code = 'POST_AGGREGATE_TOO_LARGE';

  constructor(readonly reason: string) {
    super('The post cannot be represented within the DynamoDB limits');
    this.name = 'PostAggregateTooLargeError';
  }
}

export class PostDataIntegrityError extends Error {
  readonly code = 'POST_DATA_INTEGRITY_ERROR';

  constructor(readonly reason: string) {
    super('Stored post data is inconsistent');
    this.name = 'PostDataIntegrityError';
  }
}
