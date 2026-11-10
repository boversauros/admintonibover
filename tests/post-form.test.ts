import assert from 'node:assert/strict';
import test from 'node:test';

import type { Post } from '../lib/domain/posts/types';
import { validatePost } from '../lib/domain/posts/validation';
import {
  newPostFormId,
  postFormValues,
  postFromForm,
} from '../lib/forms/postForm';

const NOW = '2026-08-22T10:00:00.000Z';
const LATER = '2026-08-22T11:00:00.000Z';
const CATEGORY = { id: 'category-1', slug: 'reflexions' };

function postFixture(): Post {
  return {
    id: 'post-1',
    category: CATEGORY,
    sortOrder: 4,
    published: true,
    date: '2026-08-20',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: {
        id: 'translation-ca',
        title: 'Títol',
        content: 'Primer paràgraf\n\nSegon paràgraf',
        slug: 'titol',
        keywords: [
          { id: 'keyword-ca-1', value: 'filosofia' },
          { id: 'keyword-ca-2', value: 'arquitectura' },
        ],
        references: [
          {
            id: 'reference-ca-1',
            type: 'text',
            reference: 'Font catalana',
            blockquote: 'Cita',
            sortOrder: 0,
          },
          {
            id: 'reference-ca-2',
            type: 'image',
            reference: 'Font sense cita',
            sortOrder: 1,
          },
        ],
        translationStatus: 'complete',
      },
      en: {
        id: 'translation-en',
        title: 'Title',
        content: 'Content',
        slug: 'title',
        keywords: [{ id: 'keyword-en-1', value: 'philosophy' }],
        references: [],
        translationStatus: 'complete',
      },
    },
    mainImage: {
      key: 'images/posts/post-1/main/a.webp',
      title: 'Main',
      alt: 'Main alt',
      contentType: 'image/webp',
      sizeBytes: 1024,
      createdAt: NOW,
      updatedAt: NOW,
    },
    thumbImage: {
      key: 'images/posts/post-1/thumb/b.webp',
      title: 'Thumb',
      alt: 'Thumb alt',
      contentType: 'image/webp',
      sizeBytes: 512,
      createdAt: NOW,
      updatedAt: NOW,
    },
    version: 7,
    migration: { source: 'legacy-backup', runId: 'migration-1' },
  };
}

test('saving an unchanged post reproduces it exactly, apart from updatedAt', () => {
  const post = postFixture();
  const saved = postFromForm(postFormValues(post), {
    category: CATEGORY,
    current: post,
    now: LATER,
    postId: 'unused',
  });
  assert.deepEqual(saved, { ...post, updatedAt: LATER });
});

test('saving cleans hidden characters and stray spaces from titles without changing slugs', () => {
  const post = postFixture();
  const values = postFormValues(post);
  values.translations.ca.title = ' La qualitat de la llum  (Vermeer) ';
  values.translations.en.title = 'The​ Quality  of the Light (Vermeer)';
  const saved = postFromForm(values, {
    category: CATEGORY,
    current: post,
    now: LATER,
    postId: 'unused',
  });
  assert.equal(saved.translations.ca.title, 'La qualitat de la llum (Vermeer)');
  assert.equal(
    saved.translations.en.title,
    'The Quality of the Light (Vermeer)'
  );
  assert.equal(saved.translations.ca.slug, post.translations.ca.slug);
  assert.equal(saved.translations.en.slug, post.translations.en.slug);
});

test('the form edits a copy, never the loaded post', () => {
  const post = postFixture();
  const values = postFormValues(post);
  values.translations.ca.keywords[0].value = 'canviat';
  values.translations.ca.references[0].reference = 'canviat';
  assert.deepEqual(post, postFixture());
});

test('edits keep stored IDs, images and migration state; new keywords get fresh IDs', () => {
  const post = postFixture();
  const values = postFormValues(post);
  values.translations.ca.title = 'Títol actualitzat';
  values.translations.ca.content = '  Un paràgraf\nUn altre\n\n\nUn tercer  ';
  values.translations.ca.keywords = [
    values.translations.ca.keywords[1],
    { id: newPostFormId('keyword-ca'), value: 'ètica' },
  ];
  values.translations.ca.references[1].blockquote = 'Cita nova';
  values.translations.ca.references[0].blockquote = '';
  values.mainImageAlt = 'Nou alt';
  values.sortOrder = Number.NaN;
  // Publishing goes through its own request after the save.
  values.published = false;

  const saved = postFromForm(values, {
    category: CATEGORY,
    current: post,
    now: LATER,
    postId: 'unused',
  });

  assert.equal(saved.id, post.id);
  assert.equal(saved.version, 7);
  assert.equal(saved.published, true);
  assert.equal(saved.sortOrder, 0);
  assert.equal(saved.date, post.date);
  assert.equal(saved.author, post.author);
  assert.equal(saved.createdAt, NOW);
  assert.deepEqual(saved.migration, post.migration);
  assert.deepEqual(saved.thumbImage, post.thumbImage);
  assert.deepEqual(saved.mainImage, { ...post.mainImage, alt: 'Nou alt' });
  assert.equal(saved.translations.ca.id, 'translation-ca');
  assert.equal(
    saved.translations.ca.content,
    'Un paràgraf\n\nUn altre\n\nUn tercer'
  );
  assert.deepEqual(saved.translations.ca.keywords[0], {
    id: 'keyword-ca-2',
    value: 'arquitectura',
  });
  assert.match(
    saved.translations.ca.keywords[1]?.id ?? '',
    /^keyword-ca-[0-9a-f-]{36}$/
  );
  assert.equal(
    'blockquote' in (saved.translations.ca.references[0] ?? {}),
    false
  );
  assert.equal(saved.translations.ca.references[1]?.blockquote, 'Cita nova');
  assert.deepEqual(validatePost(saved), []);
});

test('a new post is a draft with null images and generated IDs that pass domain validation', () => {
  const values = postFormValues();
  values.categoryId = CATEGORY.id;
  values.published = true;
  values.translations.ca = {
    ...values.translations.ca,
    title: 'Nou',
    content: 'Text',
    slug: 'nou',
    keywords: [{ id: newPostFormId('keyword-ca'), value: 'nou' }],
    references: [
      {
        id: newPostFormId('reference'),
        type: 'text',
        reference: 'Font',
        blockquote: '',
        sortOrder: 0,
      },
    ],
  };
  values.translations.en = {
    ...values.translations.en,
    title: 'New',
    content: 'Text',
    slug: 'new',
  };

  const created = postFromForm(values, {
    category: CATEGORY,
    now: NOW,
    postId: 'post-new',
  });

  assert.equal(created.id, 'post-new');
  assert.equal(created.published, false);
  assert.equal(created.version, 1);
  assert.equal(created.date, '2026-08-22');
  assert.equal(created.author, 'Admin');
  assert.equal(created.mainImage, null);
  assert.equal(created.thumbImage, null);
  assert.equal(created.migration, null);
  assert.match(created.translations.ca.id, /^translation-ca-[0-9a-f-]{36}$/);
  assert.deepEqual(validatePost(created), []);
});
