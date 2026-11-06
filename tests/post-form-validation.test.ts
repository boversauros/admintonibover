import assert from 'node:assert/strict';
import test from 'node:test';

import { postFormValues, type PostFormValues } from '../lib/forms/postForm';
import { validatePostForm } from '../lib/validation/postSchema';

function formData(): PostFormValues {
  const values = postFormValues();
  values.categoryId = '1';
  values.sortOrder = 1;
  values.translations.ca = {
    ...values.translations.ca,
    title: 'Títol en català',
    content: 'Contingut en català',
    slug: 'titol-en-catala',
  };
  values.translations.en = {
    ...values.translations.en,
    title: 'English title',
    content: 'English content',
    slug: 'english-title',
  };
  return values;
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
  values.categoryId = '';
  values.translations.ca.title = 'a'.repeat(201);

  const errors = validatePostForm(values, {
    requireCompleteTranslations: true,
  });
  assert.equal(errors.categoryId?.message, 'Selecciona una categoria.');
  assert.match(
    String(errors.translations?.ca?.title?.message),
    /no pot superar els 200 caràcters/
  );
});

test('legacy imported drafts retain partial-translation behavior', () => {
  const values = formData();
  values.translations.en.title = '';
  values.translations.en.content = '';

  assert.deepEqual(
    validatePostForm(values, { requireCompleteTranslations: false }),
    {}
  );
});
