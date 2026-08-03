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
import { POST_LANGUAGES } from '@/lib/domain/posts/types';
import {
  POST_DOMAIN_LIMITS,
  assertValidPost,
} from '@/lib/domain/posts/validation';

import { estimateDynamoDbItemSize } from './item-size';
import {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  REFERENCE_SEGMENT_TARGET_BYTES,
} from './limits';
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
  references?: StoredReference[];
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
  referenceStorage: 'inline' | 'segmented';
  referenceSegmentCounts?: Record<PostLanguage, number>;
  mainImage: PostImage | null;
  thumbImage: PostImage | null;
  version: number;
  migration: PostMigrationMetadata | null;
};

export type ReferenceSegmentItem = DynamoItem & {
  entityType: 'REFERENCE_SEGMENT';
  schemaVersion: 1;
  postId: string;
  language: PostLanguage;
  sequence: number;
  version: number;
  references: StoredReference[];
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
  referenceSegments: ReferenceSegmentItem[];
  summary: PostSummaryItem;
  slugLocks: Record<PostLanguage, SlugLockItem | null>;
};

const SORT_ORDER_WIDTH = 12;
const SEGMENT_SEQUENCE_WIDTH = 6;

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

function storedTranslation(
  translation: PostTranslation,
  includeReferences: boolean
): StoredTranslation {
  return {
    legacyId: translation.id,
    title: translation.title,
    content: translation.content,
    slug: translation.slug,
    keywords: translation.keywords.map(storedKeyword),
    ...(includeReferences
      ? { references: translation.references.map(storedReference) }
      : {}),
    translationStatus: translation.translationStatus,
  };
}

function aggregateItem(
  post: Post,
  referenceStorage: 'inline' | 'segmented',
  segmentCounts?: Record<PostLanguage, number>
): PostAggregateItem {
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
      ca: storedTranslation(
        post.translations.ca,
        referenceStorage === 'inline'
      ),
      en: storedTranslation(
        post.translations.en,
        referenceStorage === 'inline'
      ),
    },
    referenceStorage,
    ...(segmentCounts ? { referenceSegmentCounts: segmentCounts } : {}),
    mainImage: post.mainImage ? { ...post.mainImage } : null,
    thumbImage: post.thumbImage ? { ...post.thumbImage } : null,
    version: post.version,
    migration: post.migration ? { ...post.migration } : null,
  };
}

function createReferenceSegment(
  post: Post,
  language: PostLanguage,
  sequence: number,
  references: PostReference[]
): ReferenceSegmentItem {
  return {
    PK: `POST#${post.id}`,
    SK: `REFS#${language}#${sequence
      .toString()
      .padStart(SEGMENT_SEQUENCE_WIDTH, '0')}`,
    entityType: 'REFERENCE_SEGMENT',
    schemaVersion: 1,
    postId: post.id,
    language,
    sequence,
    version: post.version,
    references: references.map(storedReference),
  };
}

function segmentReferences(
  post: Post,
  language: PostLanguage
): ReferenceSegmentItem[] {
  const references = post.translations[language].references;
  const segments: ReferenceSegmentItem[] = [];
  let current: PostReference[] = [];

  for (const reference of references) {
    const candidate = createReferenceSegment(post, language, segments.length, [
      ...current,
      reference,
    ]);
    if (
      current.length > 0 &&
      estimateDynamoDbItemSize(candidate) > REFERENCE_SEGMENT_TARGET_BYTES
    ) {
      segments.push(
        createReferenceSegment(post, language, segments.length, current)
      );
      current = [reference];
    } else {
      current.push(reference);
    }
  }

  if (current.length > 0) {
    segments.push(
      createReferenceSegment(post, language, segments.length, current)
    );
  }
  return segments;
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

function assertItemBelowGuard(item: DynamoItem, description: string): void {
  const bytes = estimateDynamoDbItemSize(item);
  if (bytes >= DYNAMODB_ITEM_SIZE_GUARD_BYTES) {
    throw new PostAggregateTooLargeError(`${description}:${bytes}`);
  }
}

export function preparePostItems(post: Post): PreparedPostItems {
  assertValidPost(post);
  const inlineAggregate = aggregateItem(post, 'inline');
  let aggregate = inlineAggregate;
  let referenceSegments: ReferenceSegmentItem[] = [];

  if (
    estimateDynamoDbItemSize(inlineAggregate) >= DYNAMODB_ITEM_SIZE_GUARD_BYTES
  ) {
    const ca = segmentReferences(post, 'ca');
    const en = segmentReferences(post, 'en');
    referenceSegments = [...ca, ...en];
    aggregate = aggregateItem(post, 'segmented', {
      ca: ca.length,
      en: en.length,
    });
  }

  assertItemBelowGuard(aggregate, 'aggregate');
  referenceSegments.forEach(segment =>
    assertItemBelowGuard(
      segment,
      `segment:${segment.language}:${segment.sequence}`
    )
  );
  const summary = summaryItem(post);
  assertItemBelowGuard(summary, 'summary');

  return {
    aggregate,
    referenceSegments,
    summary,
    slugLocks: {
      ca: slugLockItem(post.id, 'ca', post.translations.ca.slug),
      en: slugLockItem(post.id, 'en', post.translations.en.slug),
    },
  };
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

function parseStoredTranslation(
  value: unknown,
  path: string,
  references: PostReference[]
): PostTranslation {
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
    references,
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
  if (record.source !== 'supabase-backup') dataError('migration.source:value');
  return {
    source: 'supabase-backup',
    runId: stringValue(record.runId, 'migration.runId'),
  };
}

function parseSegmentReferences(
  postId: string,
  version: number,
  language: PostLanguage,
  expectedCount: number,
  segments: DynamoItem[]
): PostReference[] {
  const parsed = segments
    .filter(segment => segment.language === language)
    .map((segment, index) => {
      if (
        segment.entityType !== 'REFERENCE_SEGMENT' ||
        segment.schemaVersion !== 1 ||
        segment.postId !== postId ||
        segment.language !== language ||
        segment.version !== version ||
        segment.PK !== `POST#${postId}`
      ) {
        dataError(`segments.${language}.${index}:metadata`);
      }
      const sequence = numberValue(
        segment.sequence,
        `segments.${language}.${index}.sequence`
      );
      if (
        segment.SK !==
        `REFS#${language}#${sequence
          .toString()
          .padStart(SEGMENT_SEQUENCE_WIDTH, '0')}`
      ) {
        dataError(`segments.${language}.${index}:key`);
      }
      return {
        sequence,
        references: arrayValue(
          segment.references,
          `segments.${language}.${index}.references`
        ).map((reference, referenceIndex) =>
          parseStoredReference(
            reference,
            `segments.${language}.${index}.references.${referenceIndex}`
          )
        ),
      };
    })
    .sort((left, right) => left.sequence - right.sequence);

  if (parsed.length !== expectedCount) dataError(`segments.${language}:count`);
  parsed.forEach((segment, index) => {
    if (segment.sequence !== index) dataError(`segments.${language}:sequence`);
  });
  return parsed.flatMap(segment => segment.references);
}

export function postFromItems(
  aggregate: DynamoItem,
  segmentItems: DynamoItem[]
): Post {
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
  const storage = stringValue(aggregate.referenceStorage, 'referenceStorage');
  if (storage !== 'inline' && storage !== 'segmented') {
    dataError('referenceStorage:value');
  }
  const counts =
    storage === 'segmented'
      ? recordValue(aggregate.referenceSegmentCounts, 'referenceSegmentCounts')
      : null;
  if (counts) {
    const expectedSegmentCount =
      numberValue(counts.ca, 'referenceSegmentCounts.ca') +
      numberValue(counts.en, 'referenceSegmentCounts.en');
    if (segmentItems.length !== expectedSegmentCount) {
      dataError('segments:count');
    }
  }
  const references = {} as Record<PostLanguage, PostReference[]>;
  for (const language of POST_LANGUAGES) {
    const translation = recordValue(
      translations[language],
      `translations.${language}`
    );
    if (storage === 'segmented' && translation.references !== undefined) {
      dataError(`translations.${language}.references:unexpected`);
    }
    references[language] =
      storage === 'inline'
        ? arrayValue(
            translation.references,
            `translations.${language}.references`
          ).map((reference, index) =>
            parseStoredReference(
              reference,
              `translations.${language}.references.${index}`
            )
          )
        : parseSegmentReferences(
            id,
            version,
            language,
            numberValue(
              counts![language],
              `referenceSegmentCounts.${language}`
            ),
            segmentItems
          );
  }
  if (storage === 'inline' && segmentItems.length > 0)
    dataError('segments:unexpected');

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
      ca: parseStoredTranslation(
        translations.ca,
        'translations.ca',
        references.ca
      ),
      en: parseStoredTranslation(
        translations.en,
        'translations.en',
        references.en
      ),
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
