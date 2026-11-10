import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTitle } from '../lib/utils/normalizeTitle';
import { generateUniqueSlug, slugify } from '../lib/utils/slugify';

test('slugify normalizes accents, punctuation, whitespace, and hyphens', () => {
  assert.equal(
    slugify('  Reflexió: Ànima, espai -- i temps!  '),
    'reflexio-anima-espai-i-temps'
  );
});

test('normalizing a title never changes the slug generated from it', () => {
  for (const title of [
    'The Quality of the Light  (Johannes Vermeer & Caravaggio)',
    '  Fotografia  com a escenografia de la ciutat ',
    'Il​la Diagonal﻿',
  ]) {
    assert.equal(slugify(normalizeTitle(title)), slugify(title));
  }
  assert.equal(
    normalizeTitle('The Quality of the Light  (Johannes Vermeer)'),
    'The Quality of the Light (Johannes Vermeer)'
  );
});

test('generateUniqueSlug advances until it finds a free suffix', () => {
  assert.equal(
    generateUniqueSlug('reflexio', ['reflexio', 'reflexio-1', 'reflexio-2']),
    'reflexio-3'
  );
});
