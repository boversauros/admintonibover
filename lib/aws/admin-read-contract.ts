import type {
  Post,
  PostImage,
  PostKeyword,
  PostLanguage,
  PostListItem,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';

export const ADMIN_API_VERSION = 1 as const;

export type AdminCategoryRead = {
  id: string;
  slug: string;
  names: Record<PostLanguage, string>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminKeywordRead = {
  id: string;
  language: PostLanguage;
  value: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminPostListPage = {
  items: PostListItem[];
  nextCursor: string | null;
};

export type AdminApiSuccessEnvelope<T> = {
  version: typeof ADMIN_API_VERSION;
  data: T;
  requestId: string;
};

export type AdminApiErrorEnvelope = {
  version: typeof ADMIN_API_VERSION;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
};

function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

function integerValue(value: unknown, path: string): number {
  const parsed = numberValue(value, path);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`${path} must be an integer`);
  }
  return parsed;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value;
}

function languageRecord<T>(
  value: unknown,
  path: string,
  parse: (entry: unknown, entryPath: string) => T
): Record<PostLanguage, T> {
  const record = recordValue(value, path);
  return {
    ca: parse(record.ca, `${path}.ca`),
    en: parse(record.en, `${path}.en`),
  };
}

function parseImage(value: unknown, path: string): PostImage | null {
  if (value === null) return null;
  const image = recordValue(value, path);
  return {
    key: stringValue(image.key, `${path}.key`),
    title: stringValue(image.title, `${path}.title`),
    alt: stringValue(image.alt, `${path}.alt`),
    contentType: stringValue(image.contentType, `${path}.contentType`),
    sizeBytes: numberValue(image.sizeBytes, `${path}.sizeBytes`),
    createdAt: stringValue(image.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(image.updatedAt, `${path}.updatedAt`),
  };
}

function parseKeyword(value: unknown, path: string): PostKeyword {
  const keyword = recordValue(value, path);
  return {
    id: stringValue(keyword.id, `${path}.id`),
    value: stringValue(keyword.value, `${path}.value`),
  };
}

function parseReference(value: unknown, path: string): PostReference {
  const reference = recordValue(value, path);
  const type = stringValue(reference.type, `${path}.type`);
  if (type !== 'image' && type !== 'text') {
    throw new TypeError(`${path}.type is invalid`);
  }
  const blockquote = reference.blockquote;
  if (blockquote !== undefined && typeof blockquote !== 'string') {
    throw new TypeError(`${path}.blockquote must be a string`);
  }
  return {
    id: stringValue(reference.id, `${path}.id`),
    type,
    reference: stringValue(reference.reference, `${path}.reference`),
    ...(blockquote === undefined ? {} : { blockquote }),
    sortOrder: numberValue(reference.sortOrder, `${path}.sortOrder`),
  };
}

function parseTranslation(value: unknown, path: string): PostTranslation {
  const translation = recordValue(value, path);
  const translationStatus = stringValue(
    translation.translationStatus,
    `${path}.translationStatus`
  );
  if (translationStatus !== 'complete' && translationStatus !== 'incomplete') {
    throw new TypeError(`${path}.translationStatus is invalid`);
  }
  return {
    id: stringValue(translation.id, `${path}.id`),
    title: stringValue(translation.title, `${path}.title`),
    content: stringValue(translation.content, `${path}.content`),
    slug: stringValue(translation.slug, `${path}.slug`),
    keywords: arrayValue(translation.keywords, `${path}.keywords`).map(
      (entry, index) => parseKeyword(entry, `${path}.keywords.${index}`)
    ),
    references: arrayValue(translation.references, `${path}.references`).map(
      (entry, index) => parseReference(entry, `${path}.references.${index}`)
    ),
    translationStatus,
  };
}

export function parseAdminPost(value: unknown, path = 'data.post'): Post {
  const post = recordValue(value, path);
  const category = recordValue(post.category, `${path}.category`);
  let migration: Post['migration'] = null;
  if (post.migration !== null) {
    const metadata = recordValue(post.migration, `${path}.migration`);
    if (metadata.source !== 'supabase-backup') {
      throw new TypeError(`${path}.migration.source is invalid`);
    }
    migration = {
      source: 'supabase-backup',
      runId: stringValue(metadata.runId, `${path}.migration.runId`),
    };
  }
  return {
    id: stringValue(post.id, `${path}.id`),
    category: {
      id: stringValue(category.id, `${path}.category.id`),
      slug: stringValue(category.slug, `${path}.category.slug`),
    },
    sortOrder: numberValue(post.sortOrder, `${path}.sortOrder`),
    published: booleanValue(post.published, `${path}.published`),
    date: stringValue(post.date, `${path}.date`),
    author: stringValue(post.author, `${path}.author`),
    createdAt: stringValue(post.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(post.updatedAt, `${path}.updatedAt`),
    translations: languageRecord(
      post.translations,
      `${path}.translations`,
      parseTranslation
    ),
    mainImage: parseImage(post.mainImage, `${path}.mainImage`),
    thumbImage: parseImage(post.thumbImage, `${path}.thumbImage`),
    version: integerValue(post.version, `${path}.version`),
    migration,
  };
}

function parseListItem(value: unknown, path: string): PostListItem {
  const post = recordValue(value, path);
  const category = recordValue(post.category, `${path}.category`);
  return {
    id: stringValue(post.id, `${path}.id`),
    category: {
      id: stringValue(category.id, `${path}.category.id`),
      slug: stringValue(category.slug, `${path}.category.slug`),
    },
    sortOrder: numberValue(post.sortOrder, `${path}.sortOrder`),
    published: booleanValue(post.published, `${path}.published`),
    date: stringValue(post.date, `${path}.date`),
    author: stringValue(post.author, `${path}.author`),
    updatedAt: stringValue(post.updatedAt, `${path}.updatedAt`),
    version: integerValue(post.version, `${path}.version`),
    titles: languageRecord(post.titles, `${path}.titles`, stringValue),
    excerpts: languageRecord(post.excerpts, `${path}.excerpts`, stringValue),
    keywords: languageRecord(
      post.keywords,
      `${path}.keywords`,
      (entry, entryPath) =>
        arrayValue(entry, entryPath).map((keyword, index) =>
          stringValue(keyword, `${entryPath}.${index}`)
        )
    ),
    mainImage: parseImage(post.mainImage, `${path}.mainImage`),
    thumbImage: parseImage(post.thumbImage, `${path}.thumbImage`),
  };
}

function parseCategory(value: unknown, path: string): AdminCategoryRead {
  const category = recordValue(value, path);
  return {
    id: stringValue(category.id, `${path}.id`),
    slug: stringValue(category.slug, `${path}.slug`),
    names: languageRecord(category.names, `${path}.names`, stringValue),
    version: integerValue(category.version, `${path}.version`),
    createdAt: stringValue(category.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(category.updatedAt, `${path}.updatedAt`),
  };
}

function parseAdminKeyword(value: unknown, path: string): AdminKeywordRead {
  const keyword = recordValue(value, path);
  const language = stringValue(keyword.language, `${path}.language`);
  if (language !== 'ca' && language !== 'en') {
    throw new TypeError(`${path}.language is invalid`);
  }
  return {
    id: stringValue(keyword.id, `${path}.id`),
    language,
    value: stringValue(keyword.value, `${path}.value`),
    version: integerValue(keyword.version, `${path}.version`),
    createdAt: stringValue(keyword.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(keyword.updatedAt, `${path}.updatedAt`),
  };
}

function parseSuccessEnvelope<T>(
  value: unknown,
  parseData: (data: unknown) => T
): AdminApiSuccessEnvelope<T> {
  const envelope = recordValue(value, 'response');
  if (envelope.version !== ADMIN_API_VERSION) {
    throw new TypeError('response.version is invalid');
  }
  return {
    version: ADMIN_API_VERSION,
    data: parseData(envelope.data),
    requestId: stringValue(envelope.requestId, 'response.requestId'),
  };
}

export function parsePostListEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<AdminPostListPage> {
  return parseSuccessEnvelope(value, data => {
    const page = recordValue(data, 'response.data');
    const nextCursor = page.nextCursor;
    if (nextCursor !== null && typeof nextCursor !== 'string') {
      throw new TypeError('response.data.nextCursor is invalid');
    }
    return {
      items: arrayValue(page.items, 'response.data.items').map((entry, index) =>
        parseListItem(entry, `response.data.items.${index}`)
      ),
      nextCursor,
    };
  });
}

export function parsePostDetailEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<{ post: Post; replayed: boolean }> {
  return parseSuccessEnvelope(value, data => {
    const detail = recordValue(data, 'response.data');
    return {
      post: parseAdminPost(detail.post),
      replayed: booleanValue(detail.replayed, 'response.data.replayed'),
    };
  });
}

export function parseCategoriesEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<{ items: AdminCategoryRead[] }> {
  return parseSuccessEnvelope(value, data => {
    const result = recordValue(data, 'response.data');
    return {
      items: arrayValue(result.items, 'response.data.items').map(
        (entry, index) => parseCategory(entry, `response.data.items.${index}`)
      ),
    };
  });
}

export function parseKeywordsEnvelope(
  value: unknown
): AdminApiSuccessEnvelope<{ items: AdminKeywordRead[] }> {
  return parseSuccessEnvelope(value, data => {
    const result = recordValue(data, 'response.data');
    return {
      items: arrayValue(result.items, 'response.data.items').map(
        (entry, index) =>
          parseAdminKeyword(entry, `response.data.items.${index}`)
      ),
    };
  });
}

export function parseAdminApiErrorEnvelope(
  value: unknown
): AdminApiErrorEnvelope {
  const envelope = recordValue(value, 'response');
  const error = recordValue(envelope.error, 'response.error');
  if (envelope.version !== ADMIN_API_VERSION) {
    throw new TypeError('response.version is invalid');
  }
  return {
    version: ADMIN_API_VERSION,
    error: {
      code: stringValue(error.code, 'response.error.code'),
      message: stringValue(error.message, 'response.error.message'),
    },
    requestId: stringValue(envelope.requestId, 'response.requestId'),
  };
}
