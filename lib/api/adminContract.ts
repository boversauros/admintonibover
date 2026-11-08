/**
 * The browser's view of the AWS admin API: envelope and payload types plus the
 * parsers that check every response before the UI trusts it. The Next.js
 * server forwards responses unchanged, so this is the only place they are
 * checked outside the Lambda.
 */
import type {
  ConfirmedImageUpload,
  DetachedImage,
  ImagePreview,
  ImageRole,
  MediaInspection,
  PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import {
  parseNullablePostImage,
  parsePost,
  parsePostImage,
} from '@/lib/contract/post';
import {
  arrayValue,
  booleanValue,
  integerValue,
  nullableStringValue,
  numberValue,
  oneOf,
  recordValue,
  stringValue,
} from '@/lib/contract/values';
import type {
  Post,
  PostLanguage,
  PostListItem,
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

/** A list item plus a short-lived signed URL for its uploaded thumbnail. */
export type AdminPostListItem = PostListItem & {
  thumbPreviewUrl: string | null;
};

export type AdminPostListPage = {
  items: AdminPostListItem[];
  nextCursor: string | null;
};

export type ImageCleanup = {
  pending: boolean;
  failedCount: number;
};

export type DeletePostMutationResult = {
  postId: string;
  cleanup: ImageCleanup;
};

export type BulkPublicationResult = {
  publishedCount: number;
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

export type EnvelopeParser<T> = (value: unknown) => AdminApiSuccessEnvelope<T>;

function roleValue(value: unknown, path: string): ImageRole {
  return oneOf(value, path, ['main', 'thumb']);
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

function parseImagePreview(value: unknown, path: string): ImagePreview {
  const preview = recordValue(value, path);
  return {
    image: parsePostImage(preview.image, `${path}.image`),
    previewUrl: nullableStringValue(preview.previewUrl, `${path}.previewUrl`),
    previewExpiresAt: nullableStringValue(
      preview.previewExpiresAt,
      `${path}.previewExpiresAt`
    ),
  };
}

function parseCleanup(value: unknown, path: string): ImageCleanup {
  const cleanup = recordValue(value, path);
  return {
    pending: booleanValue(cleanup.pending, `${path}.pending`),
    failedCount: integerValue(cleanup.failedCount, `${path}.failedCount`),
  };
}

function parseListItem(value: unknown, path: string): AdminPostListItem {
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
    mainImage: parseNullablePostImage(post.mainImage, `${path}.mainImage`),
    thumbImage: parseNullablePostImage(post.thumbImage, `${path}.thumbImage`),
    thumbPreviewUrl:
      post.thumbPreviewUrl === undefined
        ? null
        : nullableStringValue(post.thumbPreviewUrl, `${path}.thumbPreviewUrl`),
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
  return {
    id: stringValue(keyword.id, `${path}.id`),
    language: oneOf(keyword.language, `${path}.language`, ['ca', 'en']),
    value: stringValue(keyword.value, `${path}.value`),
    version: integerValue(keyword.version, `${path}.version`),
    createdAt: stringValue(keyword.createdAt, `${path}.createdAt`),
    updatedAt: stringValue(keyword.updatedAt, `${path}.updatedAt`),
  };
}

/** Checks the envelope and hands its `data` record to the payload parser. */
function successEnvelope<T>(
  parseData: (data: Record<string, unknown>) => T
): EnvelopeParser<T> {
  return value => {
    const envelope = recordValue(value, 'response');
    if (envelope.version !== ADMIN_API_VERSION) {
      throw new TypeError('response.version is invalid');
    }
    return {
      version: ADMIN_API_VERSION,
      data: parseData(recordValue(envelope.data, 'response.data')),
      requestId: stringValue(envelope.requestId, 'response.requestId'),
    };
  };
}

export const parsePostListEnvelope = successEnvelope<AdminPostListPage>(
  page => ({
    items: arrayValue(page.items, 'response.data.items').map((entry, index) =>
      parseListItem(entry, `response.data.items.${index}`)
    ),
    nextCursor: nullableStringValue(
      page.nextCursor,
      'response.data.nextCursor'
    ),
  })
);

export const parsePostDetailEnvelope = successEnvelope<{
  post: Post;
}>(detail => ({
  post: parsePost(detail.post, 'data.post'),
}));

export const parseCategoriesEnvelope = successEnvelope<{
  items: AdminCategoryRead[];
}>(result => ({
  items: arrayValue(result.items, 'response.data.items').map((entry, index) =>
    parseCategory(entry, `response.data.items.${index}`)
  ),
}));

export const parseKeywordsEnvelope = successEnvelope<{
  items: AdminKeywordRead[];
}>(result => ({
  items: arrayValue(result.items, 'response.data.items').map((entry, index) =>
    parseAdminKeyword(entry, `response.data.items.${index}`)
  ),
}));

export const parseDeleteEnvelope = successEnvelope<DeletePostMutationResult>(
  result => ({
    postId: stringValue(result.postId, 'response.data.postId'),
    cleanup: parseCleanup(result.cleanup, 'response.data.cleanup'),
  })
);

export const parseDetachedImageEnvelope = successEnvelope<DetachedImage>(
  result => ({
    postId: stringValue(result.postId, 'response.data.postId'),
    postVersion: integerValue(result.postVersion, 'response.data.postVersion'),
    role: roleValue(result.role, 'response.data.role'),
    detached: booleanValue(result.detached, 'response.data.detached'),
    cleanup: parseCleanup(result.cleanup, 'response.data.cleanup'),
  })
);

export const parseBulkEnvelope = successEnvelope<BulkPublicationResult>(
  result => ({
    publishedCount: integerValue(
      result.publishedCount,
      'response.data.publishedCount'
    ),
  })
);

export const parseMediaInspectionEnvelope = successEnvelope<MediaInspection>(
  inspection => {
    const images = recordValue(inspection.images, 'response.data.images');
    return {
      postId: stringValue(inspection.postId, 'response.data.postId'),
      postVersion: integerValue(
        inspection.postVersion,
        'response.data.postVersion'
      ),
      titles: languageRecord(
        inspection.titles,
        'response.data.titles',
        stringValue
      ),
      images: {
        main:
          images.main === null
            ? null
            : parseImagePreview(images.main, 'response.data.images.main'),
        thumb:
          images.thumb === null
            ? null
            : parseImagePreview(images.thumb, 'response.data.images.thumb'),
      },
    };
  }
);

export const parsePresignEnvelope = successEnvelope<PresignedImageUpload>(
  upload => {
    const headers = recordValue(upload.headers, 'response.data.headers');
    return {
      uploadId: stringValue(upload.uploadId, 'response.data.uploadId'),
      objectKey: stringValue(upload.objectKey, 'response.data.objectKey'),
      uploadUrl: stringValue(upload.uploadUrl, 'response.data.uploadUrl'),
      headers: {
        'content-type': stringValue(
          headers['content-type'],
          'response.data.headers.content-type'
        ) as PresignedImageUpload['headers']['content-type'],
        'x-amz-checksum-sha256': stringValue(
          headers['x-amz-checksum-sha256'],
          'response.data.headers.x-amz-checksum-sha256'
        ),
      },
      expiresAt: stringValue(upload.expiresAt, 'response.data.expiresAt'),
      postVersion: integerValue(
        upload.postVersion,
        'response.data.postVersion'
      ),
    };
  }
);

export const parseConfirmedEnvelope = successEnvelope<ConfirmedImageUpload>(
  confirmed => ({
    postId: stringValue(confirmed.postId, 'response.data.postId'),
    postVersion: integerValue(
      confirmed.postVersion,
      'response.data.postVersion'
    ),
    role: roleValue(confirmed.role, 'response.data.role'),
    image: parseImagePreview(confirmed.image, 'response.data.image'),
    cleanupPending: booleanValue(
      confirmed.cleanupPending,
      'response.data.cleanupPending'
    ),
  })
);

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
