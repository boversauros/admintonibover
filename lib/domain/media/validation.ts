import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_ROLES,
  MAX_IMAGE_BYTES,
  type AllowedImageMimeType,
  type ImageUploadDescriptor,
} from './contracts';
import { MediaValidationError, type MediaValidationIssue } from './errors';

const EXTENSIONS_BY_MIME: Record<AllowedImageMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['avif'],
};

const NORMALIZED_EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const CHECKSUM_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const FILE_NAME_PATTERN = /^[^/\\\u0000-\u001f]{1,255}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

function issue(
  issues: MediaValidationIssue[],
  path: string,
  code: string,
  message: string
): void {
  issues.push({ path, code, message });
}

export function normalizedExtension(contentType: AllowedImageMimeType): string {
  return NORMALIZED_EXTENSION_BY_MIME[contentType];
}

export function validateIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new MediaValidationError([
      {
        path: 'idempotencyKey',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must contain 8-200 safe ASCII characters',
      },
    ]);
  }
}

export function validateUploadDescriptor(
  value: unknown
): ImageUploadDescriptor {
  const issues: MediaValidationIssue[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MediaValidationError([
      {
        path: 'body',
        code: 'INVALID_BODY',
        message: 'A JSON object is required',
      },
    ]);
  }
  const record = value as Record<string, unknown>;
  const role = record.role;
  const fileName = record.fileName;
  const contentType = record.contentType;
  const sizeBytes = record.sizeBytes;
  const checksumSha256 = record.checksumSha256;
  const expectedVersion = record.expectedVersion;

  if (!IMAGE_ROLES.includes(role as never)) {
    issue(issues, 'role', 'INVALID_IMAGE_ROLE', 'Role must be main or thumb');
  }
  if (typeof fileName !== 'string' || !FILE_NAME_PATTERN.test(fileName)) {
    issue(
      issues,
      'fileName',
      'INVALID_FILE_NAME',
      'File name must be a plain name of at most 255 characters'
    );
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(contentType as never)) {
    issue(
      issues,
      'contentType',
      'UNSUPPORTED_IMAGE_TYPE',
      `Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`
    );
  }
  if (
    !Number.isSafeInteger(sizeBytes) ||
    (sizeBytes as number) < 1 ||
    (sizeBytes as number) > MAX_IMAGE_BYTES
  ) {
    issue(
      issues,
      'sizeBytes',
      'INVALID_IMAGE_SIZE',
      `Image size must be between 1 and ${MAX_IMAGE_BYTES} bytes`
    );
  }
  if (
    typeof checksumSha256 !== 'string' ||
    !CHECKSUM_PATTERN.test(checksumSha256)
  ) {
    issue(
      issues,
      'checksumSha256',
      'INVALID_IMAGE_CHECKSUM',
      'A base64-encoded SHA-256 checksum is required'
    );
  }
  if (
    !Number.isSafeInteger(expectedVersion) ||
    (expectedVersion as number) < 1
  ) {
    issue(
      issues,
      'expectedVersion',
      'INVALID_POST_VERSION',
      'Expected version must be an integer of at least 1'
    );
  }

  if (
    typeof fileName === 'string' &&
    FILE_NAME_PATTERN.test(fileName) &&
    ALLOWED_IMAGE_MIME_TYPES.includes(contentType as never)
  ) {
    const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
    const allowed = EXTENSIONS_BY_MIME[contentType as AllowedImageMimeType];
    if (!allowed.includes(extension)) {
      issue(
        issues,
        'fileName',
        'IMAGE_EXTENSION_MISMATCH',
        `File extension must match ${contentType}`
      );
    }
  }

  if (issues.length > 0) throw new MediaValidationError(issues);
  return {
    role: role as ImageUploadDescriptor['role'],
    fileName: fileName as string,
    contentType: contentType as AllowedImageMimeType,
    sizeBytes: sizeBytes as number,
    checksumSha256: checksumSha256 as string,
    expectedVersion: expectedVersion as number,
  };
}

export function validateImageText(
  value: unknown,
  path: 'title' | 'alt'
): string {
  const maximum = path === 'title' ? 250 : 300;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new MediaValidationError([
      {
        path,
        code: 'INVALID_IMAGE_TEXT',
        message: `${path} must be a string of at most ${maximum} characters`,
      },
    ]);
  }
  return value;
}
