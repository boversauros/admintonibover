import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findSecretReasons,
  isEnvironmentFile,
} from '../scripts/check-secrets.mjs';

function createJwt(role: string) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.${'s'.repeat(32)}`;
}

test('detects credentials used by this repository', () => {
  const text = [
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'AKIA' + 'A'.repeat(16),
    'ghp_' + 'g'.repeat(36),
    'sb_' + 'secret_' + 's'.repeat(24),
    createJwt('service_role'),
  ].join('\n');

  assert.deepEqual(findSecretReasons(text), [
    'private key material',
    'AWS access key ID',
    'GitHub access token',
    'Supabase secret key',
    'Supabase service-role key',
  ]);
});

test('allows public Supabase keys and unrelated service token formats', () => {
  const text = [
    'sb_' + 'publishable_' + 'p'.repeat(24),
    createJwt('anon'),
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
