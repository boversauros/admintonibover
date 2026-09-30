import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminMutationError } from '../lib/api/adminMutations';
import { AdminReadError } from '../lib/api/adminReads';
import {
  applyLegacySlugRow,
  countDraftsWithLegacySlugs,
  legacyRedirects,
  pacedRequests,
  scanLegacySlugs,
  type LegacySlugDependencies,
} from '../lib/api/legacySlugs';
import {
  isLegacyNumericSlug,
  isReservedPostSlug,
} from '../lib/domain/posts/public-slugs';
import type { Post } from '../lib/domain/posts/types';
import type { PostFormData } from '../lib/types/post';
import { validatePostSlugs } from '../lib/validation/postSlugRules';

const NOW = '2026-08-22T10:00:00.000Z';
const LATER = '2026-10-01T09:00:00.000Z';
const CATEGORIES = ['vivencies', 'perspectives', 'influencies'];

function post(
  id: string,
  sortOrder: number,
  ca: { title: string; slug: string },
  en: { title: string; slug: string },
  published = false
): Post {
  const translation = (
    language: 'ca' | 'en',
    value: { title: string; slug: string }
  ) => ({
    id: `${id}-${language}`,
    title: value.title,
    content: `Contingut *${language}*`,
    slug: value.slug,
    keywords: [{ id: `kw-${language}`, value: 'llum' }],
    references: [
      {
        id: `ref-${id}-${language}`,
        type: 'text' as const,
        reference: '*Font*',
        blockquote: 'Cita',
        sortOrder: 3,
      },
    ],
    translationStatus: 'complete' as const,
  });
  return {
    id,
    category: { id: 'category-1', slug: 'vivencies' },
    sortOrder,
    published,
    date: '2026-06-01',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: translation('ca', ca),
      en: translation('en', en),
    },
    mainImage: null,
    thumbImage: null,
    version: 3,
    migration: { source: 'legacy-backup', runId: 'migration-1' },
  };
}

function fakeApi(posts: Post[]) {
  const store = new Map(posts.map(item => [item.id, structuredClone(item)]));
  const updates: Array<{ post: Post; version: number; key: string }> = [];
  const listed: Array<boolean | undefined> = [];
  const dependencies: LegacySlugDependencies = {
    async listPostIds(published) {
      listed.push(published);
      return [...store.values()]
        .filter(item => published === undefined || item.published === published)
        .map(item => item.id);
    },
    async getPost(id) {
      const found = store.get(id);
      return found ? structuredClone(found) : null;
    },
    async updatePost(next, version, key) {
      updates.push({ post: structuredClone(next), version, key });
      const saved = { ...structuredClone(next), version: version + 1 };
      store.set(next.id, saved);
      return saved;
    },
  };
  return { dependencies, updates, listed, store };
}

// Shapes taken from production: `-68` became `68`, and post 081 had both.
const fixtures = () => [
  post(
    'p100',
    100,
    { title: 'IA, la nebulosa del futur', slug: 'ia-la-nebulosa-del-futur' },
    { title: 'AI, the Nebula of the Future', slug: '68' },
    true
  ),
  post(
    'p081',
    81,
    { title: 'Línies de foc i taques de llum', slug: '2' },
    { title: 'Lines of Fire and Light Stains', slug: '49' }
  ),
  post(
    'p010',
    10,
    { title: 'Els núvols', slug: 'els-nuvols' },
    { title: 'Clouds', slug: 'clouds' }
  ),
  post(
    'p011',
    11,
    { title: 'Núvols bis', slug: 'nuvols-bis' },
    { title: 'Clouds', slug: '12' }
  ),
  post(
    'p012',
    12,
    { title: 'Vivències', slug: '3' },
    { title: 'Experiences', slug: 'experiences' }
  ),
  post(
    'p013',
    13,
    { title: '1968', slug: '1968' },
    { title: 'Year 1968', slug: 'year-1968' }
  ),
];

test('only numeric slugs that differ from their title are legacy', () => {
  assert.equal(isLegacyNumericSlug('68', 'AI, the Nebula of the Future'), true);
  assert.equal(isLegacyNumericSlug('1968', '1968'), false);
  assert.equal(isLegacyNumericSlug('clouds', 'Clouds'), false);
  assert.equal(isReservedPostSlug('index', CATEGORIES), true);
  assert.equal(isReservedPostSlug('vivencies', CATEGORIES), true);
  assert.equal(isReservedPostSlug('1968', CATEGORIES), false);
});

test('the scan previews every legacy slug and blocks unsafe replacements', async () => {
  const { dependencies } = fakeApi(fixtures());
  const rows = await scanLegacySlugs(dependencies, CATEGORIES);

  assert.deepEqual(
    rows.map(row => [row.postId, row.changes, row.blocked === null]),
    [
      ['p011', [{ language: 'en', from: '12', to: 'clouds' }], false],
      ['p012', [{ language: 'ca', from: '3', to: 'vivencies' }], false],
      [
        'p081',
        [
          { language: 'ca', from: '2', to: 'linies-de-foc-i-taques-de-llum' },
          { language: 'en', from: '49', to: 'lines-of-fire-and-light-stains' },
        ],
        true,
      ],
      [
        'p100',
        [{ language: 'en', from: '68', to: 'ai-the-nebula-of-the-future' }],
        true,
      ],
    ]
  );
  assert.match(rows[0].blocked ?? '', /Un altre article/);
  assert.match(rows[1].blocked ?? '', /pàgina del web/);
  assert.equal(rows[3].published, true);
  assert.deepEqual(legacyRedirects(rows.slice(3)), [
    '/en/reflexions/-68/ -> /en/reflexions/ai-the-nebula-of-the-future/',
  ]);
});

test('applying changes only the slugs and updatedAt, in one save per post', async () => {
  const { dependencies, updates, store } = fakeApi(fixtures());
  const [row] = (await scanLegacySlugs(dependencies, CATEGORIES)).filter(
    item => item.postId === 'p081'
  );
  const before = structuredClone(store.get('p081')!);

  const outcome = await applyLegacySlugRow(dependencies, row, LATER);

  assert.equal(outcome.status, 'updated');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].version, 3);
  assert.match(updates[0].key, /^post-slug-fix:[0-9a-f-]{36}$/);
  const expected = structuredClone(before);
  expected.translations.ca.slug = 'linies-de-foc-i-taques-de-llum';
  expected.translations.en.slug = 'lines-of-fire-and-light-stains';
  expected.updatedAt = LATER;
  assert.deepEqual(updates[0].post, expected);

  // A second run finds nothing left and makes no request.
  assert.deepEqual(await applyLegacySlugRow(dependencies, row, LATER), {
    status: 'unchanged',
  });
  assert.equal(updates.length, 1);
  assert.equal(
    (await scanLegacySlugs(dependencies, CATEGORIES)).some(
      item => item.postId === 'p081'
    ),
    false
  );
});

test('a post edited after the scan is not saved', async () => {
  const { dependencies, updates, store } = fakeApi(fixtures());
  const [row] = (await scanLegacySlugs(dependencies, CATEGORIES)).filter(
    item => item.postId === 'p100'
  );
  store.get('p100')!.translations.en.title = 'AI, a Different Title';

  const outcome = await applyLegacySlugRow(dependencies, row, LATER);

  assert.equal(outcome.status, 'failed');
  assert.equal(updates.length, 0);
});

test('a slug taken on the server is reported and the run continues', async () => {
  const { dependencies } = fakeApi(fixtures());
  const [row] = (await scanLegacySlugs(dependencies, CATEGORIES)).filter(
    item => item.postId === 'p100'
  );
  dependencies.updatePost = async () => {
    throw new AdminMutationError('conflict', 409, 'POST_SLUG_CONFLICT');
  };

  assert.deepEqual(await applyLegacySlugRow(dependencies, row, LATER), {
    status: 'failed',
    message: 'Un altre article ja fa servir la nova adreça.',
  });
});

test('bulk publication counts only drafts that still need a new slug', async () => {
  const { dependencies, listed } = fakeApi(fixtures());
  // p081, p011 and p012 are drafts with legacy slugs; p100 is published.
  assert.equal(await countDraftsWithLegacySlugs(dependencies), 3);
  assert.deepEqual(listed, [false]);
});

test('the form rejects a title whose slug is a site listing address', () => {
  const values: PostFormData = {
    category_id: '1',
    sort_order: 1,
    date: '2026-08-26',
    author: 'Admin',
    is_published: false,
    translations: {
      ca: {
        language: 'ca',
        title: 'Vivències',
        content: 'Contingut',
        slug: 'vivencies',
        keywords: [],
        references: [],
      },
      en: {
        language: 'en',
        title: 'Index',
        content: 'Content',
        slug: 'index',
        keywords: [],
        references: [],
      },
    },
  };
  const errors = validatePostSlugs(values, CATEGORIES);
  assert.match(
    errors.translations?.ca?.title?.message ?? '',
    /«vivencies».*Canvia el títol/
  );
  assert.match(errors.translations?.en?.title?.message ?? '', /«index»/);
});

function fakeClock() {
  let time = 1_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
  };
}

test('requests are spaced under the API rate limit', async () => {
  const clock = fakeClock();
  const paced = pacedRequests(clock.sleep, clock.now);
  const starts: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    await paced(async () => starts.push(clock.now()));
  }
  assert.deepEqual(starts, [1_000, 1_600, 2_200]);
});

test('a throttled request is retried after the advertised delay', async () => {
  const clock = fakeClock();
  const paced = pacedRequests(clock.sleep, clock.now);
  let calls = 0;
  const result = await paced(async () => {
    calls += 1;
    if (calls === 1) {
      throw new AdminReadError('busy', 429, 'THROTTLED', 'req', '1');
    }
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.deepEqual(clock.sleeps, [1_000]);
});

test('throttling gives up after a few retries; other errors are not retried', async () => {
  const clock = fakeClock();
  const paced = pacedRequests(clock.sleep, clock.now);
  let calls = 0;
  await assert.rejects(
    paced(async () => {
      calls += 1;
      throw new AdminMutationError('busy', 429, 'THROTTLED');
    }),
    /busy/
  );
  assert.equal(calls, 5);
  assert.deepEqual(clock.sleeps, [2_000, 4_000, 8_000, 16_000]);

  calls = 0;
  await assert.rejects(
    paced(async () => {
      calls += 1;
      throw new AdminReadError('gone', 404, 'NOT_FOUND');
    }),
    /gone/
  );
  assert.equal(calls, 1);
});
