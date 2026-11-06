import assert from 'node:assert/strict';
import test from 'node:test';

import { isCorrelationId } from '../lib/contract/correlation';
import { parsePost } from '../lib/contract/post';
import { ShapeError } from '../lib/contract/values';
import type { Post } from '../lib/domain/posts/types';

const NOW = '2026-08-12T10:00:00.000Z';

function post(): Post {
  const translation = {
    title: 'Títol',
    content: 'Contingut',
    slug: 'titol',
    keywords: [{ id: 'keyword-1', value: 'filosofia' }],
    references: [
      {
        id: 'reference-1',
        type: 'text' as const,
        reference: 'Llibre',
        blockquote: 'Cita',
        sortOrder: 0,
      },
    ],
    translationStatus: 'complete' as const,
  };
  return {
    id: 'post-1',
    category: { id: 'category-1', slug: 'reflexions' },
    sortOrder: 3,
    published: true,
    date: '2026-08-12',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: { ...translation, id: 'translation-ca' },
      en: { ...translation, id: 'translation-en' },
    },
    mainImage: {
      key: 'images/posts/post-1/main/a.webp',
      title: 'main',
      alt: 'alt',
      contentType: 'image/webp',
      sizeBytes: 1024,
      createdAt: NOW,
      updatedAt: NOW,
    },
    thumbImage: null,
    version: 2,
    migration: { source: 'legacy-backup', runId: 'run-1' },
  };
}

test('the shared Post parser returns an equal copy of a valid post', () => {
  const input = post();
  const parsed = parsePost(structuredClone(input));
  assert.deepEqual(parsed, input);
  assert.deepEqual(
    parsePost({ ...input, migration: undefined }).migration,
    null
  );
});

test('shape errors name the full path and a stable code', () => {
  const input = post();
  const broken = {
    ...input,
    translations: {
      ...input.translations,
      en: {
        ...input.translations.en,
        references: [{ ...input.translations.en.references[0], type: 'video' }],
      },
    },
  };
  for (const [prefix, expectedPath] of [
    ['', 'translations.en.references.0.type'],
    ['data.post', 'data.post.translations.en.references.0.type'],
  ]) {
    assert.throws(
      () => parsePost(broken, prefix),
      (error: unknown) =>
        error instanceof ShapeError &&
        error.path === expectedPath &&
        error.code === 'INVALID_VALUE'
    );
  }
  assert.throws(
    () =>
      parsePost({
        ...input,
        mainImage: { ...input.mainImage, sizeBytes: 1.5 },
      }),
    (error: unknown) =>
      error instanceof ShapeError &&
      error.path === 'mainImage.sizeBytes' &&
      error.code === 'INVALID_INTEGER'
  );
  assert.throws(
    () => parsePost('not a post'),
    (error: unknown) =>
      error instanceof ShapeError &&
      error.path === 'body' &&
      error.code === 'INVALID_OBJECT'
  );
});

test('only short, plain correlation IDs are echoed', () => {
  assert.equal(isCorrelationId('browser-request:1.a_b'), true);
  assert.equal(isCorrelationId(null), false);
  assert.equal(isCorrelationId(''), false);
  assert.equal(isCorrelationId('-starts-with-dash'), false);
  assert.equal(isCorrelationId('has space'), false);
  assert.equal(isCorrelationId('a'.repeat(65)), false);
});
