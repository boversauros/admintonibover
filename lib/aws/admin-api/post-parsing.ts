import {
  IMAGE_INVENTORY_STATUSES,
  type ImageInventoryStatus,
} from '@/lib/domain/media/contracts';
import { PostValidationError } from '@/lib/domain/posts/errors';
import type {
  Post,
  PostImage,
  PostKeyword,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';
import { assertValidPost } from '@/lib/domain/posts/validation';

import type { AdminApiEvent } from './context';
import { ApiValidationError, validation } from './errors';
import {
  booleanField,
  isRecord,
  numberField,
  recordBody,
  stringField,
  validateId,
} from './http';

const MAX_LIST_LIMIT = 50;

function parseKeyword(value: unknown, path: string): PostKeyword {
  const record = recordBody(value);
  return {
    id: validateId(record.id, `${path}.id`),
    value: stringField(record, 'value', `${path}.value`, 60),
  };
}

function parseReference(value: unknown, path: string): PostReference {
  const record = recordBody(value);
  const type = record.type;
  if (type !== 'image' && type !== 'text') {
    throw validation(
      `${path}.type`,
      'INVALID_REFERENCE_TYPE',
      'Must be image or text'
    );
  }
  const blockquote = record.blockquote;
  if (blockquote !== undefined && typeof blockquote !== 'string') {
    throw validation(
      `${path}.blockquote`,
      'INVALID_STRING',
      'Must be a string'
    );
  }
  return {
    id: validateId(record.id, `${path}.id`),
    type,
    reference: stringField(record, 'reference', `${path}.reference`, 2048),
    ...(blockquote === undefined ? {} : { blockquote }),
    sortOrder: numberField(record, 'sortOrder', `${path}.sortOrder`),
  };
}

function parseTranslation(value: unknown, path: string): PostTranslation {
  const record = recordBody(value);
  const keywords = record.keywords;
  const references = record.references;
  if (!Array.isArray(keywords) || !Array.isArray(references)) {
    throw validation(
      path,
      'INVALID_RELATIONSHIPS',
      'Keywords and references must be arrays'
    );
  }
  const translationStatus = record.translationStatus;
  if (translationStatus !== 'complete' && translationStatus !== 'incomplete') {
    throw validation(
      `${path}.translationStatus`,
      'INVALID_TRANSLATION_STATUS',
      'Must be complete or incomplete'
    );
  }
  return {
    id: validateId(record.id, `${path}.id`),
    title: stringField(record, 'title', `${path}.title`, 200, true),
    content: stringField(record, 'content', `${path}.content`, 50_000, true),
    slug: stringField(record, 'slug', `${path}.slug`, 250, true),
    keywords: keywords.map((keyword, index) =>
      parseKeyword(keyword, `${path}.keywords.${index}`)
    ),
    references: references.map((reference, index) =>
      parseReference(reference, `${path}.references.${index}`)
    ),
    translationStatus,
  };
}

function parseImage(value: unknown, path: string): PostImage | null {
  if (value === null) return null;
  const record = recordBody(value);
  return {
    key: stringField(record, 'key', `${path}.key`, 1024),
    title: stringField(record, 'title', `${path}.title`, 200, true),
    alt: stringField(record, 'alt', `${path}.alt`, 300, true),
    contentType: stringField(record, 'contentType', `${path}.contentType`, 120),
    sizeBytes: numberField(record, 'sizeBytes', `${path}.sizeBytes`, 1),
    createdAt: stringField(record, 'createdAt', `${path}.createdAt`, 40),
    updatedAt: stringField(record, 'updatedAt', `${path}.updatedAt`, 40),
  };
}

export function parsePost(value: unknown): Post {
  const record = recordBody(value);
  const category = recordBody(record.category);
  const translations = recordBody(record.translations);
  const migration = record.migration;
  if (migration !== null && migration !== undefined && !isRecord(migration)) {
    throw validation(
      'migration',
      'INVALID_MIGRATION',
      'Migration metadata must be null or an object'
    );
  }
  if (
    isRecord(migration) &&
    migration.source !== undefined &&
    migration.source !== 'legacy-backup'
  ) {
    throw validation(
      'migration.source',
      'INVALID_MIGRATION_SOURCE',
      'Migration source is not supported'
    );
  }
  const post: Post = {
    id: validateId(record.id),
    category: {
      id: validateId(category.id, 'category.id'),
      slug: stringField(category, 'slug', 'category.slug', 120),
    },
    sortOrder: numberField(record, 'sortOrder', 'sortOrder', 0),
    published: booleanField(record, 'published', 'published'),
    date: stringField(record, 'date', 'date', 10),
    author: stringField(record, 'author', 'author', 120),
    createdAt: stringField(record, 'createdAt', 'createdAt', 40),
    updatedAt: stringField(record, 'updatedAt', 'updatedAt', 40),
    translations: {
      ca: parseTranslation(translations.ca, 'translations.ca'),
      en: parseTranslation(translations.en, 'translations.en'),
    },
    mainImage: parseImage(record.mainImage, 'mainImage'),
    thumbImage: parseImage(record.thumbImage, 'thumbImage'),
    version: numberField(record, 'version', 'version', 1),
    migration:
      migration === null || migration === undefined
        ? null
        : {
            source: 'legacy-backup',
            runId: stringField(migration, 'runId', 'migration.runId', 200),
          },
  };
  try {
    assertValidPost(post);
  } catch (error) {
    if (error instanceof PostValidationError) {
      throw new ApiValidationError(error.issues);
    }
    throw error;
  }
  return post;
}

export function parseListOptions(event: AdminApiEvent) {
  const query = event.queryStringParameters ?? {};
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw validation(
      'limit',
      'INVALID_PAGE_LIMIT',
      `Limit must be an integer between 1 and ${MAX_LIST_LIMIT}`
    );
  }
  const rawDirection = query.direction;
  if (
    rawDirection !== undefined &&
    rawDirection !== 'ascending' &&
    rawDirection !== 'descending'
  ) {
    throw validation(
      'direction',
      'INVALID_DIRECTION',
      'Direction must be ascending or descending'
    );
  }
  const direction: 'ascending' | 'descending' | undefined = rawDirection;
  let published: boolean | undefined;
  if (query.published !== undefined) {
    if (query.published !== 'true' && query.published !== 'false') {
      throw validation(
        'published',
        'INVALID_BOOLEAN',
        'Published must be true or false'
      );
    }
    published = query.published === 'true';
  }
  if (query.title !== undefined && query.title.length > 200) {
    throw validation('title', 'INVALID_STRING', 'Title filter is too long');
  }
  let imageStatus: ImageInventoryStatus | undefined;
  if (query.imageStatus !== undefined) {
    if (!IMAGE_INVENTORY_STATUSES.includes(query.imageStatus as never)) {
      throw validation(
        'imageStatus',
        'INVALID_IMAGE_STATUS',
        `Image status must be one of ${IMAGE_INVENTORY_STATUSES.join(', ')}`
      );
    }
    imageStatus = query.imageStatus as ImageInventoryStatus;
  }
  return {
    limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(direction ? { direction } : {}),
    ...(query.title ? { title: query.title } : {}),
    ...(published === undefined ? {} : { published }),
    ...(query.categoryId
      ? { categoryId: validateId(query.categoryId, 'categoryId') }
      : {}),
    ...(imageStatus ? { imageStatus } : {}),
  };
}
