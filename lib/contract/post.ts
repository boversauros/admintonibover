/**
 * The wire shape of a Post, checked the same way wherever it arrives: in a
 * create/update request to the Lambda and in a response to the browser. It
 * checks types only; `validatePost` owns the domain rules (lengths, IDs,
 * dates), which the Lambda applies on top.
 */
import type {
  Post,
  PostImage,
  PostKeyword,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';

import {
  arrayValue,
  at,
  booleanValue,
  integerValue,
  numberValue,
  oneOf,
  recordValue,
  stringValue,
} from './values';

export function parsePostImage(value: unknown, path: string): PostImage {
  const image = recordValue(value, path);
  return {
    key: stringValue(image.key, at(path, 'key')),
    title: stringValue(image.title, at(path, 'title')),
    alt: stringValue(image.alt, at(path, 'alt')),
    contentType: stringValue(image.contentType, at(path, 'contentType')),
    sizeBytes: integerValue(image.sizeBytes, at(path, 'sizeBytes')),
    createdAt: stringValue(image.createdAt, at(path, 'createdAt')),
    updatedAt: stringValue(image.updatedAt, at(path, 'updatedAt')),
  };
}

export function parseNullablePostImage(
  value: unknown,
  path: string
): PostImage | null {
  return value === null ? null : parsePostImage(value, path);
}

function parseKeyword(value: unknown, path: string): PostKeyword {
  const keyword = recordValue(value, path);
  return {
    id: stringValue(keyword.id, at(path, 'id')),
    value: stringValue(keyword.value, at(path, 'value')),
  };
}

function parseReference(value: unknown, path: string): PostReference {
  const reference = recordValue(value, path);
  const blockquote = reference.blockquote;
  return {
    id: stringValue(reference.id, at(path, 'id')),
    type: oneOf(reference.type, at(path, 'type'), ['image', 'text']),
    reference: stringValue(reference.reference, at(path, 'reference')),
    ...(blockquote === undefined
      ? {}
      : { blockquote: stringValue(blockquote, at(path, 'blockquote')) }),
    sortOrder: numberValue(reference.sortOrder, at(path, 'sortOrder')),
  };
}

function parseTranslation(value: unknown, path: string): PostTranslation {
  const translation = recordValue(value, path);
  return {
    id: stringValue(translation.id, at(path, 'id')),
    title: stringValue(translation.title, at(path, 'title')),
    content: stringValue(translation.content, at(path, 'content')),
    slug: stringValue(translation.slug, at(path, 'slug')),
    keywords: arrayValue(translation.keywords, at(path, 'keywords')).map(
      (entry, index) => parseKeyword(entry, at(at(path, 'keywords'), index))
    ),
    references: arrayValue(translation.references, at(path, 'references')).map(
      (entry, index) => parseReference(entry, at(at(path, 'references'), index))
    ),
    translationStatus: oneOf(
      translation.translationStatus,
      at(path, 'translationStatus'),
      ['complete', 'incomplete']
    ),
  };
}

function parseMigration(value: unknown, path: string): Post['migration'] {
  if (value === null || value === undefined) return null;
  const migration = recordValue(value, path);
  return {
    source: oneOf(migration.source, at(path, 'source'), ['legacy-backup']),
    runId: stringValue(migration.runId, at(path, 'runId')),
  };
}

/** Parses a Post; `path` prefixes error paths ('' for a request body). */
export function parsePost(value: unknown, path = ''): Post {
  const post = recordValue(value, path || 'body');
  const category = recordValue(post.category, at(path, 'category'));
  const translations = recordValue(post.translations, at(path, 'translations'));
  return {
    id: stringValue(post.id, at(path, 'id')),
    category: {
      id: stringValue(category.id, at(path, 'category.id')),
      slug: stringValue(category.slug, at(path, 'category.slug')),
    },
    sortOrder: numberValue(post.sortOrder, at(path, 'sortOrder')),
    published: booleanValue(post.published, at(path, 'published')),
    date: stringValue(post.date, at(path, 'date')),
    author: stringValue(post.author, at(path, 'author')),
    createdAt: stringValue(post.createdAt, at(path, 'createdAt')),
    updatedAt: stringValue(post.updatedAt, at(path, 'updatedAt')),
    translations: {
      ca: parseTranslation(translations.ca, at(path, 'translations.ca')),
      en: parseTranslation(translations.en, at(path, 'translations.en')),
    },
    mainImage: parseNullablePostImage(post.mainImage, at(path, 'mainImage')),
    thumbImage: parseNullablePostImage(post.thumbImage, at(path, 'thumbImage')),
    version: integerValue(post.version, at(path, 'version')),
    migration: parseMigration(post.migration, at(path, 'migration')),
  };
}
