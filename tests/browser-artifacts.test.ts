import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { inspectBrowserArtifacts } from '../scripts/check-browser-artifacts.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'admintonibover-browser-audit-'));
  await mkdir(join(root, 'static', 'chunks'), { recursive: true });
  await mkdir(join(root, 'server', 'app'), { recursive: true });
  await writeFile(join(root, 'build-manifest.json'), '{}');
  return root;
}

test('browser artifact audit accepts server-only markers in server code', async () => {
  const root = await fixture();
  await writeFile(
    join(root, 'server', 'app', 'route.js'),
    'process.env.AWS_COGNITO_SESSION_SECRET'
  );
  await writeFile(join(root, 'static', 'chunks', 'app.js'), 'public bundle');

  const result = await inspectBrowserArtifacts(root);
  assert.deepEqual(result.issues, []);
});

test('browser artifact audit rejects source maps, secret boundaries, and canaries', async () => {
  const root = await fixture();
  const canary = 'server-secret-canary-value';
  await writeFile(
    join(root, 'static', 'chunks', 'app.js'),
    `AWS_COGNITO_SESSION_SECRET ${canary}`
  );
  await writeFile(join(root, 'static', 'chunks', 'app.js.map'), '{}');

  const result = await inspectBrowserArtifacts(root, {
    sensitiveValues: [canary],
  });
  assert.equal(result.issues.length, 3);
  assert.equal(
    result.issues.some(issue =>
      issue.includes('production browser source map')
    ),
    true
  );
  assert.equal(
    result.issues.some(issue => issue.includes('AWS_COGNITO_SESSION_SECRET')),
    true
  );
  assert.equal(
    result.issues.some(issue => issue.includes('sensitive build canary')),
    true
  );
});
