import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUnpublishedCount } from '../lib/api/adminReads';

test('an AWS list refresh preserves an independently reconciled draft count', () => {
  assert.equal(resolveUnpublishedCount(0, undefined), 0);
  assert.equal(resolveUnpublishedCount(2, undefined), 2);
});

test('a list response with a draft count replaces the previous value', () => {
  assert.equal(resolveUnpublishedCount(undefined, 2), 2);
  assert.equal(resolveUnpublishedCount(2, 0), 0);
});
