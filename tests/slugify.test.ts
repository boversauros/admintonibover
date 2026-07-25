import assert from 'node:assert/strict';
import test from 'node:test';

import { generateUniqueSlug, slugify } from '../lib/utils/slugify';

test('slugify normalizes accents, punctuation, whitespace, and hyphens', () => {
  assert.equal(
    slugify('  Reflexió: Ànima, espai -- i temps!  '),
    'reflexio-anima-espai-i-temps'
  );
});

test('generateUniqueSlug advances until it finds a free suffix', () => {
  assert.equal(
    generateUniqueSlug('reflexio', ['reflexio', 'reflexio-1', 'reflexio-2']),
    'reflexio-3'
  );
});

test('CI rejects an intentional unit-test failure', () => {
  assert.fail('Intentional failure for issue #5 CI evidence');
});
