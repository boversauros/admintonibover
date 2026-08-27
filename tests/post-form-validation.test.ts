import assert from 'node:assert/strict';
import test from 'node:test';

import type { PostFormData } from '../lib/types/post';
import { validatePostForm } from '../lib/validation/postSchema';

function formData(): PostFormData {
  return {
    category_id: '1',
    sort_order: 1,
    date: '2026-08-26',
    author: 'Admin',
    is_published: false,
    translations: {
      ca: {
        language: 'ca',
        title: 'Títol en català',
        content: 'Contingut en català',
        slug: 'titol-en-catala',
        keywords: [],
        references: [],
      },
      en: {
        language: 'en',
        title: 'English title',
        content: 'English content',
        slug: 'english-title',
        keywords: [],
        references: [],
      },
    },
  };
}

test('post form validation accepts a complete bilingual post', () => {
  assert.deepEqual(
    validatePostForm(formData(), { requireCompleteTranslations: true }),
    {}
  );
});

test('post form validation identifies the missing translation before AWS submit', () => {
  const values = formData();
  values.translations.en.title = '';
  values.translations.en.content = '   ';

  const errors = validatePostForm(values, {
    requireCompleteTranslations: true,
  });
  assert.equal(
    errors.translations?.en?.title?.message,
    'Cal introduir el títol en anglès.'
  );
  assert.equal(
    errors.translations?.en?.content?.message,
    'Cal introduir el contingut en anglès.'
  );
});

test('post form validation enforces the category and server title limit', () => {
  const values = formData();
  values.category_id = '';
  values.translations.ca.title = 'a'.repeat(201);

  const errors = validatePostForm(values, {
    requireCompleteTranslations: true,
  });
  assert.equal(errors.category_id?.message, 'Selecciona una categoria.');
  assert.match(
    String(errors.translations?.ca?.title?.message),
    /no pot superar els 200 caràcters/
  );
});

test('legacy Supabase drafts retain partial-translation behavior', () => {
  const values = formData();
  values.translations.en.title = '';
  values.translations.en.content = '';

  assert.deepEqual(
    validatePostForm(values, { requireCompleteTranslations: false }),
    {}
  );
});
