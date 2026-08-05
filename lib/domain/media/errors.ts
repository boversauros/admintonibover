export type MediaValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class MediaValidationError extends Error {
  readonly code = 'MEDIA_VALIDATION_FAILED';

  constructor(readonly issues: MediaValidationIssue[]) {
    super('Image upload validation failed');
    this.name = 'MediaValidationError';
  }
}

export class MediaUploadConflictError extends Error {
  readonly code = 'MEDIA_UPLOAD_CONFLICT';

  constructor(readonly uploadId: string) {
    super('The upload conflicts with an existing request');
    this.name = 'MediaUploadConflictError';
  }
}

export class MediaUploadNotFoundError extends Error {
  readonly code = 'MEDIA_UPLOAD_NOT_FOUND';

  constructor(readonly uploadId: string) {
    super('The image upload was not found');
    this.name = 'MediaUploadNotFoundError';
  }
}

export class MediaUploadExpiredError extends Error {
  readonly code = 'MEDIA_UPLOAD_EXPIRED';

  constructor(readonly uploadId: string) {
    super('The image upload has expired');
    this.name = 'MediaUploadExpiredError';
  }
}

export class MediaUploadIntegrityError extends Error {
  readonly code = 'MEDIA_UPLOAD_INTEGRITY_FAILED';

  constructor(readonly reason: string) {
    super('The uploaded object did not match the signed request');
    this.name = 'MediaUploadIntegrityError';
  }
}
