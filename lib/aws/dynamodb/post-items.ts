import {
  PostAggregateTooLargeError,
  PostDataIntegrityError,
  PostValidationError,
} from '@/lib/domain/posts/errors';
import type {
  Post,
  PostImage,
  PostKeyword,
  PostLanguage,
  PostListItem,
  PostMigrationMetadata,
  PostReference,
  PostTranslation,
  TranslationStatus,
} from '@/lib/domain/posts/types';
import {
  POST_DOMAIN_LIMITS,
  assertValidPost,
} from '@/lib/domain/posts/validation';

import type { DynamoItem, DynamoKey } from './port';

type StoredKeyword = {
  legacyId: string;
  value: string;
};

type StoredReference = {
  id: string;
  type: 'image' | 'text';
  reference: string;
  blockquote?: string;
  sortOrder: number;
};

type StoredTranslation = {
  legacyId: string;
  title: string;
  content: string;
  slug: string;
  keywords: StoredKeyword[];
  references: StoredReference[];
  translationStatus: TranslationStatus;
};

export type PostAggregateItem = DynamoItem & {
  entityType: 'POST';
  schemaVersion: 1;
  id: string;
  category: { id: string; slug: string };
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  translations: Record<PostLanguage, StoredTranslation>;
  // Always 'inline'. Lambdas built before segmentation was removed require it.
  referenceStorage: 'inline';
  mainImage: PostImage | null;
  thumbImage: PostImage | null;
  version: number;
  migration: PostMigrationMetadata | null;
};

export type PostSummaryItem = DynamoItem & {
  entityType: 'POST_SUMMARY';
  schemaVersion: 1;
  id: string;
  category: { id: string; slug: string };
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  updatedAt: string;
  version: number;
  titles: Record<PostLanguage, string>;
  excerpts: Record<PostLanguage, string>;
  keywords: Record<PostLanguage, string[]>;
  mainImage: PostImage | null;
  thumbImage: PostImage | null;
};

export type SlugLockItem = DynamoItem & {
  entityType: 'SLUG_LOCK';
  schemaVersion: 1;
  postId: string;
  language: PostLanguage;
};

export type PreparedPostItems = {
  aggregate: PostAggregateItem;
  summary: PostSummaryItem;
  slugLocks: Record<PostLanguage, SlugLockItem | null>;
};

const SORT_ORDER_WIDTH = 12;
/** Serialized JSON overstates DynamoDB's size, whose item limit is 400 KiB. */
const POST_AGGREGATE_MAX_JSON_BYTES = 300 * 1024;

export function postKey(postId: string): DynamoKey {
  return { PK: `POST#${postId}`, SK: `POST#${postId}` };
}

export function slugLockKey(language: PostLanguage, slug: string): DynamoKey {
  return { PK: `SLUG#${language}#${slug}`, SK: 'LOCK' };
}

function encodedSortOrder(sortOrder: number): string {
  return sortOrder.toString().padStart(SORT_ORDER_WIDTH, '0');
}

export function postSummaryKey(
  post: Pick<Post, 'id' | 'sortOrder' | 'date'>
): DynamoKey {
  return {
    PK: 'POSTS',
    SK: `ORDER#${encodedSortOrder(post.sortOrder)}#DATE#${post.date}#POST#${post.id}`,
  };
}

function storedKeyword(keyword: PostKeyword): StoredKeyword {
  return { legacyId: keyword.id, value: keyword.value };
}

function storedReference(reference: PostReference): StoredReference {
  return {
    id: reference.id,
    type: reference.type,
    reference: reference.reference,
    ...(reference.blockquote === undefined
      ? {}
      : { blockquote: reference.blockquote }),
    sortOrder: reference.sortOrder,
  };
}

function storedTranslation(translation: PostTranslation): StoredTranslation {
  return {
    legacyId: translation.id,
    title: translation.title,
    content: translation.content,
    slug: translation.slug,
    keywords: translation.keywords.map(storedKeyword),
    references: translation.references.map(storedReference),
    translationStatus: translation.translationStatus,
  };
}

function aggregateItem(post: Post): PostAggregateItem {
  return {
    ...postKey(post.id),
    entityType: 'POST',
    schemaVersion: 1,
    id: post.id,
    category: { ...post.category },
    sortOrder: post.sortOrder,
    published: post.published,
    date: post.date,
    author: post.author,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    translations: {
      ca: storedTranslation(post.translations.ca),
      en: storedTranslation(post.translations.en),
    },
    referenceStorage: 'inline',
    mainImage: post.mainImage ? { ...post.mainImage } : null,
    thumbImage: post.thumbImage ? { ...post.thumbImage } : null,
    version: post.version,
    migration: post.migration ? { ...post.migration } : null,
  };
}

function excerpt(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, POST_DOMAIN_LIMITS.excerpt);
}

function summaryItem(post: Post): PostSummaryItem {
  return {
    ...postSummaryKey(post),
    entityType: 'POST_SUMMARY',
    schemaVersion: 1,
    id: post.id,
    category: { ...post.category },
    sortOrder: post.sortOrder,
    published: post.published,
    date: post.date,
    author: post.author,
    updatedAt: post.updatedAt,
    version: post.version,
    titles: {
      ca: post.translations.ca.title,
      en: post.translations.en.title,
    },
    excerpts: {
      ca: excerpt(post.translations.ca.content),
      en: excerpt(post.translations.en.content),
    },
    keywords: {
      ca: post.translations.ca.keywords.map(keyword => keyword.value),
      en: post.translations.en.keywords.map(keyword => keyword.value),
    },
    mainImage: post.mainImage ? { ...post.mainImage } : null,
    thumbImage: post.thumbImage ? { ...post.thumbImage } : null,
  };
}

function slugLockItem(
  postId: string,
  language: PostLanguage,
  slug: string
): SlugLockItem | null {
  if (slug.length === 0) return null;
  return {
    ...slugLockKey(language, slug),
    entityType: 'SLUG_LOCK',
    schemaVersion: 1,
    postId,
    language,
  };
}

/** Builds items without a size check, so stored posts stay editable. */
export function preparePostItems(post: Post): PreparedPostItems {
  assertValidPost(post);
  return {
    aggregate: aggregateItem(post),
    summary: summaryItem(post),
    slugLocks: {
      ca: slugLockItem(post.id, 'ca', post.translations.ca.slug),
      en: slugLockItem(post.id, 'en', post.translations.en.slug),
    },
  };
}

/** Builds items for a new post state, rejecting one that is too large. */
export function prepareNewPostItems(post: Post): PreparedPostItems {
  const prepared = preparePostItems(post);
  const bytes = Buffer.byteLength(JSON.stringify(prepared.aggregate), 'utf8');
  if (bytes > POST_AGGREGATE_MAX_JSON_BYTES) {
    throw new PostAggregateTooLargeError(`aggregate:${bytes}`);
  }
  return prepared;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataError(reason: string): never {
  throw new PostDataIntegrityError(reason);
}

function stringValue(value: unknown, path: string): string {
  return typeof value === 'string' ? value : dataError(`${path}:string`);
}

function numberValue(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : dataError(`${path}:number`);
}

function booleanValue(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : dataError(`${path}:boolean`);
}

function recordValue(value: unknown, path: string): Record<string, unknown> {
  return isRecord(value) ? value : dataError(`${path}:object`);
}

function arrayValue(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : dataError(`${path}:array`);
}

function parseStoredReference(value: unknown, path: string): PostReference {
  const record = recordValue(value, path);
  const type = stringValue(record.type, `${path}.type`);
  if (type !== 'image' && type !== 'text') dataError(`${path}.type:value`);
  const blockquote = record.blockquote;
  if (blockquote !== undefined && typeof blockquote !== 'string') {
    dataError(`${path}.blockquote:string`);
  }
  return {
    id: stringValue(record.id, `${path}.id`),
    type,
    reference: stringValue(record.reference, `${path}.reference`),
    ...(blockquote === undefined ? {} : { blockquote }),
    sortOrder: numberValue(record.sortOrder, `${path}.sortOrder`),
  };
}

function parseStoredKeyword(value: unknown, path: string): PostKeyword {
  const record = recordValue(value, path);
  return {
    id: stringValue(record.legacyId, `${path}.legacyId`),
    value: stringValue(record.value, `${path}.value`),
  };
}

function parseStoredTranslation(value: unknown, path: string): PostTranslation {
  const record = recordValue(value, path);
  const status = stringValue(
    record.translationStatus,
    `${path}.translationStatus`
  );
  if (status !== 'complete' && status !== 'incomplete') {
    dataError(`${path}.translationStatus:value`);
  }
  return {
    id: stringValue(record.legacyId, `${path}.legacyId`),
    title: stringValue(record.title, `${path}.title`),
    content: stringValue(record.content, `${path}.content`),
    slug: stringValue(record.slug, `${path}.slug`),
    keywords: arrayValue(record.keywords, `${path}.keywords`).map(
      (keyword, index) =>
        parseStoredKeyword(keyword, `${path}.keywords.${index}`)
    ),
    references: arrayValue(record.references, `${path}.references`).map(
      (reference, index) =>
        parseStoredReference(reference, `${path}.references.${index}`)
    ),
    translationStatus: status,
  };
}

function parseImage(value: unknown, path: string): PostImage | null {
  if (value === null) return null;
  const record = recordValue(value, path);
  return {
    key: stringValue(record.key, `${path}.key`),
    title: stringValue(record.title, `${path}.title`),
    alt: stringValue(record.alt, `${path}.alt`),
    contentType: stringValue(record.contentType, `${path}.contentType`),
    sizeBytes: numberValue(record.sizeBytes, `${path}.sizeBytes`),
    createdAt: stringValue(record.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(record.updatedAt, `${path}.updatedAt`),
  };
}

function parseMigration(value: unknown): PostMigrationMetadata | null {
  if (value === null) return null;
  const record = recordValue(value, 'migration');
  if (record.source !== 'legacy-backup') dataError('migration.source:value');
  return {
    source: 'legacy-backup',
    runId: stringValue(record.runId, 'migration.runId'),
  };
}

export function postFromItem(aggregate: DynamoItem): Post {
  if (
    aggregate.entityType !== 'POST' ||
    aggregate.schemaVersion !== 1 ||
    aggregate.PK !== `POST#${aggregate.id}` ||
    aggregate.SK !== `POST#${aggregate.id}`
  ) {
    dataError('aggregate:metadata');
  }
  const id = stringValue(aggregate.id, 'id');
  const version = numberValue(aggregate.version, 'version');
  const translations = recordValue(aggregate.translations, 'translations');
  if (aggregate.referenceStorage !== 'inline') {
    dataError('referenceStorage:value');
  }

  const category = recordValue(aggregate.category, 'category');
  const post: Post = {
    id,
    category: {
      id: stringValue(category.id, 'category.id'),
      slug: stringValue(category.slug, 'category.slug'),
    },
    sortOrder: numberValue(aggregate.sortOrder, 'sortOrder'),
    published: booleanValue(aggregate.published, 'published'),
    date: stringValue(aggregate.date, 'date'),
    author: stringValue(aggregate.author, 'author'),
    createdAt: stringValue(aggregate.createdAt, 'createdAt'),
    updatedAt: stringValue(aggregate.updatedAt, 'updatedAt'),
    translations: {
      ca: parseStoredTranslation(translations.ca, 'translations.ca'),
      en: parseStoredTranslation(translations.en, 'translations.en'),
    },
    mainImage: parseImage(aggregate.mainImage, 'mainImage'),
    thumbImage: parseImage(aggregate.thumbImage, 'thumbImage'),
    version,
    migration: parseMigration(aggregate.migration),
  };

  try {
    assertValidPost(post);
  } catch (error) {
    if (error instanceof PostValidationError)
      dataError('aggregate:domain-validation');
    throw error;
  }
  return post;
}

export function postListItemFromItem(item: DynamoItem): PostListItem {
  if (
    item.PK !== 'POSTS' ||
    item.entityType !== 'POST_SUMMARY' ||
    item.schemaVersion !== 1
  ) {
    dataError('summary:metadata');
  }
  const category = recordValue(item.category, 'summary.category');
  const titles = recordValue(item.titles, 'summary.titles');
  const excerpts = recordValue(item.excerpts, 'summary.excerpts');
  const keywords = recordValue(item.keywords, 'summary.keywords');
  const result: PostListItem = {
    id: stringValue(item.id, 'summary.id'),
    category: {
      id: stringValue(category.id, 'summary.category.id'),
      slug: stringValue(category.slug, 'summary.category.slug'),
    },
    sortOrder: numberValue(item.sortOrder, 'summary.sortOrder'),
    published: booleanValue(item.published, 'summary.published'),
    date: stringValue(item.date, 'summary.date'),
    author: stringValue(item.author, 'summary.author'),
    updatedAt: stringValue(item.updatedAt, 'summary.updatedAt'),
    version: numberValue(item.version, 'summary.version'),
    titles: {
      ca: stringValue(titles.ca, 'summary.titles.ca'),
      en: stringValue(titles.en, 'summary.titles.en'),
    },
    excerpts: {
      ca: stringValue(excerpts.ca, 'summary.excerpts.ca'),
      en: stringValue(excerpts.en, 'summary.excerpts.en'),
    },
    keywords: {
      ca: arrayValue(keywords.ca, 'summary.keywords.ca').map((value, index) =>
        stringValue(value, `summary.keywords.ca.${index}`)
      ),
      en: arrayValue(keywords.en, 'summary.keywords.en').map((value, index) =>
        stringValue(value, `summary.keywords.en.${index}`)
      ),
    },
    mainImage:
      item.mainImage === undefined
        ? null
        : parseImage(item.mainImage, 'summary.mainImage'),
    thumbImage: parseImage(item.thumbImage, 'summary.thumbImage'),
  };
  if (item.SK !== postSummaryKey(result).SK) dataError('summary:key');
  return result;
}

export function postIdFromSlugLock(item: DynamoItem): string {
  if (
    item.entityType !== 'SLUG_LOCK' ||
    item.schemaVersion !== 1 ||
    item.SK !== 'LOCK'
  ) {
    dataError('slugLock:metadata');
  }
  return stringValue(item.postId, 'slugLock.postId');
}
