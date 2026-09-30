import assert from 'node:assert/strict';
import test from 'node:test';

import { findSecretReasons } from '../scripts/check-secrets.mjs';
import { reportSiteRebuild, SITE_REBUILD_EVENT } from '../lib/api/siteRebuild';
import {
  mutationAffectsSite,
  siteRebuildForMutation,
  siteRebuildHookUrl,
  triggerSiteRebuild,
} from '../lib/site-rebuild';

// Built at runtime so the repository secret scan never sees a hook URL.
const HOOK_URL = [
  'https://api.vercel.com/v1/integrations/deploy',
  'prj_' + 'T'.repeat(24),
  'h'.repeat(10),
].join('/');
const environment = { SITE_REBUILD_HOOK_URL: HOOK_URL };

async function captureErrors<T>(
  action: () => Promise<T>
): Promise<{ result: T; logged: string }> {
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (...values: unknown[]) => {
    lines.push(values.map(String).join(' '));
  };
  try {
    return { result: await action(), logged: lines.join('\n') };
  } finally {
    console.error = originalError;
  }
}

test('accepts only Vercel Deploy Hook URLs', () => {
  assert.equal(siteRebuildHookUrl({}), null);
  assert.equal(siteRebuildHookUrl({ SITE_REBUILD_HOOK_URL: '  ' }), null);
  assert.equal(siteRebuildHookUrl(environment)?.toString(), HOOK_URL);
  assert.ok(
    siteRebuildHookUrl({
      SITE_REBUILD_HOOK_URL: `${HOOK_URL}?buildCache=false`,
    })
  );
  for (const invalid of [
    HOOK_URL.replace('https:', 'http:'),
    HOOK_URL.replace('api.vercel.com', 'api.vercel.com.example.invalid'),
    HOOK_URL.replace('/deploy/', '/other/'),
    `${HOOK_URL}?redirect=https://example.invalid`,
    `${HOOK_URL}#fragment`,
    'not a url',
  ]) {
    assert.throws(() => siteRebuildHookUrl({ SITE_REBUILD_HOOK_URL: invalid }));
  }
});

test('the repository secret scan flags Deploy Hook URLs', () => {
  assert.deepEqual(findSecretReasons(`hook=${HOOK_URL}`), [
    'Vercel Deploy Hook URL',
  ]);
});

test('an unset hook is disabled and makes no request', async () => {
  let calls = 0;
  const status = await triggerSiteRebuild('test', {
    environment: {},
    fetchImpl: async () => {
      calls += 1;
      return new Response(null);
    },
  });
  assert.equal(status, 'disabled');
  assert.equal(calls, 0);
});

test('posts once to the configured hook and reports a queued build', async () => {
  const requests: Array<{ url: string; method?: string }> = [];
  const status = await triggerSiteRebuild('test', {
    environment,
    fetchImpl: async (input, init) => {
      requests.push({ url: String(input), method: init?.method });
      return Response.json({ job: { state: 'PENDING' } }, { status: 201 });
    },
  });
  assert.equal(status, 'requested');
  assert.deepEqual(requests, [{ url: HOOK_URL, method: 'POST' }]);
});

test('hook failures are reported without logging the secret URL', async () => {
  const cases: Array<{
    name: string;
    fetchImpl: typeof fetch;
    failure: string;
  }> = [
    {
      name: 'rate limit',
      fetchImpl: async () => new Response('slow down', { status: 429 }),
      failure: 'rate_limited',
    },
    {
      name: 'rejection',
      fetchImpl: async () => new Response('gone', { status: 404 }),
      failure: 'rejected',
    },
    {
      name: 'network error naming the URL',
      fetchImpl: async () => {
        throw new TypeError(`fetch failed for ${HOOK_URL}`);
      },
      failure: 'network',
    },
    {
      name: 'timeout',
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          );
        }),
      failure: 'timeout',
    },
  ];

  for (const { name, fetchImpl, failure } of cases) {
    const { result, logged } = await captureErrors(() =>
      triggerSiteRebuild('test', { environment, fetchImpl, timeoutMs: 10 })
    );
    assert.equal(result, 'failed', name);
    assert.match(logged, /"event":"site_rebuild_failed"/, name);
    assert.match(logged, new RegExp(`"failure":"${failure}"`), name);
    assert.doesNotMatch(logged, /vercel\.com|prj_|h{10}/, name);
  }
});

test('a malformed hook fails visibly without logging its value', async () => {
  const { result, logged } = await captureErrors(() =>
    triggerSiteRebuild('test', {
      environment: { SITE_REBUILD_HOOK_URL: 'https://example.invalid/secret' },
      fetchImpl: async () => {
        throw new Error('must not be called');
      },
    })
  );
  assert.equal(result, 'failed');
  assert.match(logged, /site_rebuild_misconfigured/);
  assert.doesNotMatch(logged, /example\.invalid|secret/);
});

test('rebuild policies skip changes that cannot affect the site', () => {
  const post = (published: boolean) =>
    JSON.stringify({ version: 1, data: { post: { published } } });
  const bulk = (publishedCount: number) =>
    JSON.stringify({ version: 1, data: { publishedCount } });

  assert.equal(mutationAffectsSite('always', '{}'), true);
  assert.equal(mutationAffectsSite('ifPublished', post(true)), true);
  assert.equal(mutationAffectsSite('ifPublished', post(false)), false);
  assert.equal(mutationAffectsSite('ifPublishedCount', bulk(3)), true);
  assert.equal(mutationAffectsSite('ifPublishedCount', bulk(0)), false);
  // Unreadable success bodies cannot prove the site is unchanged.
  assert.equal(mutationAffectsSite('ifPublished', 'not json'), true);
  assert.equal(mutationAffectsSite('ifPublishedCount', '{}'), true);
});

test('only committed mutations with a policy trigger a rebuild', async () => {
  let calls = 0;
  const trigger = async () => {
    calls += 1;
    return 'requested' as const;
  };
  const published = JSON.stringify({ data: { post: { published: true } } });
  const draft = JSON.stringify({ data: { post: { published: false } } });

  assert.equal(
    await siteRebuildForMutation(
      undefined,
      { ok: true, body: published },
      'x',
      trigger
    ),
    null
  );
  assert.equal(
    await siteRebuildForMutation(
      'always',
      { ok: false, body: '{}' },
      'x',
      trigger
    ),
    null
  );
  assert.equal(
    await siteRebuildForMutation(
      'ifPublished',
      { ok: true, body: draft },
      'x',
      trigger
    ),
    'skipped'
  );
  assert.equal(calls, 0);
  assert.equal(
    await siteRebuildForMutation(
      'ifPublished',
      { ok: true, body: published },
      'x',
      trigger
    ),
    'requested'
  );
  assert.equal(calls, 1);
});

test('a throwing trigger never escapes into the mutation response', async () => {
  const status = await siteRebuildForMutation(
    'always',
    { ok: true, body: '{}' },
    'x',
    async () => {
      throw new Error('boom');
    }
  );
  assert.equal(status, 'failed');
});

test('the browser broadcasts only known rebuild outcomes', () => {
  const originalWindow = globalThis.window;
  const target = new EventTarget();
  const seen: string[] = [];
  target.addEventListener(SITE_REBUILD_EVENT, event => {
    seen.push((event as CustomEvent<string>).detail);
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: target,
  });
  try {
    const withHeader = (value: string) =>
      new Response(null, { headers: { 'x-site-rebuild': value } });
    reportSiteRebuild(withHeader('failed'));
    reportSiteRebuild(withHeader('requested'));
    reportSiteRebuild(withHeader('<script>'));
    reportSiteRebuild(new Response(null));
    assert.deepEqual(seen, ['failed', 'requested']);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});
