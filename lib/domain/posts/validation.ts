import { POST_LIMITS } from '@/lib/validation/postSchema';
import { slugify } from '@/lib/utils/slugify';

import { PostValidationError, type PostValidationIssue } from './errors';
import {
  POST_LANGUAGES,
  type Post,
  type PostImage,
  type PostLanguage,
  type PostReference,
  type PostTranslation,
} from './types';

export const POST_DOMAIN_LIMITS = {
  id: 64,
  slug: 250,
  categorySlug: 120,
  sortOrder: 999_999_999_999,
  imageKey: 1024,
  imageAlt: 300,
  imageContentType: 120,
  imageSizeBytes: 5 * 1024 * 1024,
  excerpt: 160,
} as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addIssue(
  issues: PostValidationIssue[],
  path: string,
  code: string,
  message: string
): void {
  issues.push({ path, code, message });
}

function validateId(
  issues: PostValidationIssue[],
  path: string,
  value: string
): void {
  if (!ID_PATTERN.test(value)) {
    addIssue(
      issues,
      path,
      'INVALID_ID',
      'Must be an opaque ID containing only letters, digits, underscores, or hyphens'
    );
  }
}

function validateBoundedString(
  issues: PostValidationIssue[],
  path: string,
  value: string,
  maximum: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): void {
  if ((!allowEmpty && value.length === 0) || value.length > maximum) {
    addIssue(
      issues,
      path,
      'INVALID_LENGTH',
      allowEmpty
        ? `Must contain at most ${maximum} characters`
        : `Must contain between 1 and ${maximum} characters`
    );
  }
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isUtcTimestamp(value: string): boolean {
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function validateImage(
  issues: PostValidationIssue[],
  path: string,
  image: PostImage | null
): void {
  if (image === null) return;

  validateBoundedString(
    issues,
    `${path}.key`,
    image.key,
    POST_DOMAIN_LIMITS.imageKey
  );
  validateBoundedString(
    issues,
    `${path}.title`,
    image.title,
    POST_LIMITS.title,
    {
      allowEmpty: true,
    }
  );
  validateBoundedString(
    issues,
    `${path}.alt`,
    image.alt,
    POST_DOMAIN_LIMITS.imageAlt,
    { allowEmpty: true }
  );
  validateBoundedString(
    issues,
    `${path}.contentType`,
    image.contentType,
    POST_DOMAIN_LIMITS.imageContentType
  );
  if (
    !Number.isSafeInteger(image.sizeBytes) ||
    image.sizeBytes < 1 ||
    image.sizeBytes > POST_DOMAIN_LIMITS.imageSizeBytes
  ) {
    addIssue(
      issues,
      `${path}.sizeBytes`,
      'INVALID_IMAGE_SIZE',
      `Must be an integer between 1 and ${POST_DOMAIN_LIMITS.imageSizeBytes}`
    );
  }
  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isUtcTimestamp(image[field])) {
      addIssue(
        issues,
        `${path}.${field}`,
        'INVALID_TIMESTAMP',
        'Must be a normalized UTC ISO-8601 timestamp'
      );
    }
  }
}

function validateReference(
  issues: PostValidationIssue[],
  path: string,
  reference: PostReference
): void {
  validateId(issues, `${path}.id`, reference.id);
  if (reference.type !== 'image' && reference.type !== 'text') {
    addIssue(
      issues,
      `${path}.type`,
      'INVALID_REFERENCE_TYPE',
      'Must be image or text'
    );
  }
  validateBoundedString(
    issues,
    `${path}.reference`,
    reference.reference,
    POST_LIMITS.referenceUrl
  );
  if (reference.blockquote !== undefined) {
    validateBoundedString(
      issues,
      `${path}.blockquote`,
      reference.blockquote,
      POST_LIMITS.blockquote,
      { allowEmpty: true }
    );
  }
  if (!Number.isSafeInteger(reference.sortOrder)) {
    addIssue(
      issues,
      `${path}.sortOrder`,
      'INVALID_SORT_ORDER',
      'Must be an integer'
    );
  }
}

function validateTranslation(
  issues: PostValidationIssue[],
  language: PostLanguage,
  translation: PostTranslation,
  allowIncomplete: boolean
): void {
  const path = `translations.${language}`;
  validateId(issues, `${path}.id`, translation.id);
  const incomplete = translation.translationStatus === 'incomplete';

  if (incomplete && !allowIncomplete) {
    addIssue(
      issues,
      `${path}.translationStatus`,
      'INCOMPLETE_TRANSLATION',
      'Normal post writes require complete translations'
    );
  }

  validateBoundedString(
    issues,
    `${path}.title`,
    translation.title,
    POST_LIMITS.title,
    {
      allowEmpty: incomplete && allowIncomplete,
    }
  );
  validateBoundedString(
    issues,
    `${path}.content`,
    translation.content,
    POST_LIMITS.content,
    { allowEmpty: incomplete && allowIncomplete }
  );
  validateBoundedString(
    issues,
    `${path}.slug`,
    translation.slug,
    POST_DOMAIN_LIMITS.slug,
    {
      allowEmpty: incomplete && allowIncomplete,
    }
  );

  if (
    translation.slug.length > 0 &&
    slugify(translation.slug) !== translation.slug
  ) {
    addIssue(
      issues,
      `${path}.slug`,
      'SLUG_NOT_NORMALIZED',
      'Must already be normalized'
    );
  }

  const keywordIds = new Set<string>();
  translation.keywords.forEach((keyword, index) => {
    const keywordPath = `${path}.keywords.${index}`;
    validateId(issues, `${keywordPath}.id`, keyword.id);
    validateBoundedString(
      issues,
      `${keywordPath}.value`,
      keyword.value,
      POST_LIMITS.keyword
    );
    if (keywordIds.has(keyword.id)) {
      addIssue(
        issues,
        `${keywordPath}.id`,
        'DUPLICATE_KEYWORD_ID',
        'Keyword IDs must be unique within a translation'
      );
    }
    keywordIds.add(keyword.id);
  });

  const referenceIds = new Set<string>();
  translation.references.forEach((reference, index) => {
    const referencePath = `${path}.references.${index}`;
    validateReference(issues, referencePath, reference);
    if (referenceIds.has(reference.id)) {
      addIssue(
        issues,
        `${referencePath}.id`,
        'DUPLICATE_REFERENCE_ID',
        'Reference IDs must be unique within a translation'
      );
    }
    referenceIds.add(reference.id);
  });
}

export function validatePost(post: Post): PostValidationIssue[] {
  const issues: PostValidationIssue[] = [];
  const allowIncomplete = post.migration?.source === 'supabase-backup';

  validateId(issues, 'id', post.id);
  validateId(issues, 'category.id', post.category.id);
  validateBoundedString(
    issues,
    'category.slug',
    post.category.slug,
    POST_DOMAIN_LIMITS.categorySlug
  );
  if (slugify(post.category.slug) !== post.category.slug) {
    addIssue(
      issues,
      'category.slug',
      'SLUG_NOT_NORMALIZED',
      'Must already be normalized'
    );
  }
  if (
    !Number.isSafeInteger(post.sortOrder) ||
    post.sortOrder < 0 ||
    post.sortOrder > POST_DOMAIN_LIMITS.sortOrder
  ) {
    addIssue(
      issues,
      'sortOrder',
      'INVALID_SORT_ORDER',
      `Must be an integer between 0 and ${POST_DOMAIN_LIMITS.sortOrder}`
    );
  }
  if (!isCalendarDate(post.date)) {
    addIssue(
      issues,
      'date',
      'INVALID_DATE',
      'Must be a real calendar date in YYYY-MM-DD format'
    );
  }
  validateBoundedString(issues, 'author', post.author, POST_LIMITS.author);
  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isUtcTimestamp(post[field])) {
      addIssue(
        issues,
        field,
        'INVALID_TIMESTAMP',
        'Must be a normalized UTC ISO-8601 timestamp'
      );
    }
  }
  if (!Number.isSafeInteger(post.version) || post.version < 1) {
    addIssue(
      issues,
      'version',
      'INVALID_VERSION',
      'Must be an integer of at least 1'
    );
  }

  for (const language of POST_LANGUAGES) {
    validateTranslation(
      issues,
      language,
      post.translations[language],
      allowIncomplete
    );
  }

  validateImage(issues, 'mainImage', post.mainImage);
  validateImage(issues, 'thumbImage', post.thumbImage);

  if (post.migration !== null) {
    validateBoundedString(issues, 'migration.runId', post.migration.runId, 200);
  }

  return issues;
}

export function assertValidPost(post: Post): void {
  const issues = validatePost(post);
  if (issues.length > 0) throw new PostValidationError(issues);
}
