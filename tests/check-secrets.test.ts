import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findSecretReasons,
  isEnvironmentFile,
} from '../scripts/check-secrets.mjs';

test('detects credentials used by this repository', () => {
  const text = [
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'AKIA' + 'A'.repeat(16),
    'ghp_' + 'g'.repeat(36),
  ].join('\n');

  assert.deepEqual(findSecretReasons(text), [
    'private key material',
    'AWS access key ID',
    'GitHub access token',
  ]);
});

test('allows unrelated service token formats', () => {
  const text = [
    'glpat-' + 'g'.repeat(24),
    'xoxb-' + 's'.repeat(24),
    'sk_' + 'live_' + 'x'.repeat(24),
  ].join('\n');

  assert.deepEqual(findSecretReasons(text), []);
});

test('identifies environment files anywhere in the repository', () => {
  assert.equal(isEnvironmentFile('.env'), true);
  assert.equal(isEnvironmentFile('config/.env.local'), true);
  assert.equal(isEnvironmentFile('config/.env.production'), true);
  assert.equal(isEnvironmentFile('config/environment.ts'), false);
});
