import assert from 'node:assert/strict';
import test from 'node:test';

import { isReservedPostSlug } from '../lib/domain/posts/public-slugs';
import { postFormValues } from '../lib/forms/postForm';
import { validatePostSlugs } from '../lib/validation/postSlugRules';

const CATEGORIES = ['vivencies', 'perspectives', 'influencies'];

test('index and category slugs are site listing addresses', () => {
  assert.equal(isReservedPostSlug('index', CATEGORIES), true);
  assert.equal(isReservedPostSlug('vivencies', CATEGORIES), true);
  assert.equal(isReservedPostSlug('1968', CATEGORIES), false);
});

test('the form rejects a title whose slug is a site listing address', () => {
  const values = postFormValues();
  values.categoryId = '1';
  values.translations.ca = {
    ...values.translations.ca,
    title: 'Vivències',
    content: 'Contingut',
    slug: 'vivencies',
  };
  values.translations.en = {
    ...values.translations.en,
    title: 'Index',
    content: 'Content',
    slug: 'index',
  };
  const errors = validatePostSlugs(values, CATEGORIES);
  assert.match(
    errors.translations?.ca?.title?.message ?? '',
    /«vivencies».*Canvia el títol/
  );
  assert.match(errors.translations?.en?.title?.message ?? '', /«index»/);
});
