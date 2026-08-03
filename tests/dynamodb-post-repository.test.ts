import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PostAggregateTooLargeError,
  PostDataIntegrityError,
  PostSlugConflictError,
  PostVersionConflictError,
} from '../lib/domain/posts/errors';
import type { Post, PostImage, PostReference } from '../lib/domain/posts/types';
import { InMemoryDynamoDbPort } from '../lib/aws/dynamodb/in-memory-port';
import { DynamoDbPostRepository } from '../lib/aws/dynamodb/post-repository';

const INITIAL_TIME = '2026-08-03T10:00:00.000Z';
const UPDATE_TIME = '2026-08-03T11:00:00.000Z';

function image(role: 'main' | 'thumb'): PostImage {
  return {
    key: `images/post-1/${role}.webp`,
    title: `${role} title`,
    alt: `${role} alt`,
    contentType: 'image/webp',
    sizeBytes: role === 'main' ? 4096 : 2048,
    createdAt: INITIAL_TIME,
    updatedAt: INITIAL_TIME,
  };
}

function reference(id: string, sortOrder: number): PostReference {
  return {
    id,
    type: sortOrder % 2 === 0 ? 'text' : 'image',
    reference: `https://reference.invalid/${id}`,
    ...(sortOrder % 2 === 0 ? { blockquote: `Quote ${id}` } : {}),
    sortOrder,
  };
}

function fixturePost({
  id = 'post-1',
  sortOrder = 1,
  categoryId = 'category-1',
  caSlug = `${id}-ca`,
  enSlug = `${id}-en`,
  withImages = true,
}: {
  id?: string;
  sortOrder?: number;
  categoryId?: string;
  caSlug?: string;
  enSlug?: string;
  withImages?: boolean;
} = {}): Post {
  return {
    id,
    category: { id: categoryId, slug: `slug-${categoryId}` },
    sortOrder,
    published: false,
    date: '2026-08-03',
    author: 'Fixture Author',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
    translations: {
      ca: {
        id: `${id}-translation-ca`,
        title: `Títol ${id}`,
        content: `Contingut complet per ${id}`,
        slug: caSlug,
        keywords: [{ id: `${id}-keyword-ca`, value: 'català' }],
        references: [reference(`${id}-reference-ca`, 0)],
        translationStatus: 'complete',
      },
      en: {
        id: `${id}-translation-en`,
        title: `Title ${id}`,
        content: `Complete content for ${id}`,
        slug: enSlug,
        keywords: [{ id: `${id}-keyword-en`, value: 'english' }],
        references: [reference(`${id}-reference-en`, 0)],
        translationStatus: 'complete',
      },
    },
    mainImage: withImages ? image('main') : null,
    thumbImage: withImages ? image('thumb') : null,
    version: 99,
    migration: null,
  };
}

function testRepository(maximumPageSize = Number.POSITIVE_INFINITY) {
  let now = INITIAL_TIME;
  const port = new InMemoryDynamoDbPort([], maximumPageSize);
  const repository = new DynamoDbPostRepository(port, {
    queryPageSize: 2,
    clock: () => new Date(now),
  });
  return {
    port,
    repository,
    setTime(value: string) {
      now = value;
    },
  };
}

test('create/read/list/update/delete round trip preserves all supported fields', async () => {
  const { port, repository, setTime } = testRepository();
  const input = fixturePost();

  const created = await repository.create(input);
  assert.equal(created.version, 1);
  assert.equal(created.createdAt, INITIAL_TIME);
  assert.equal(created.updatedAt, INITIAL_TIME);
  assert.deepEqual(await repository.getById(created.id), created);
  assert.deepEqual(
    await repository.getBySlug('ca', created.translations.ca.slug),
    created
  );

  const listed = await repository.list({ limit: 10, direction: 'ascending' });
  assert.equal(listed.nextCursor, null);
  assert.deepEqual(listed.items, [
    {
      id: created.id,
      category: created.category,
      sortOrder: created.sortOrder,
      published: created.published,
      date: created.date,
      author: created.author,
      updatedAt: created.updatedAt,
      version: created.version,
      titles: {
        ca: created.translations.ca.title,
        en: created.translations.en.title,
      },
      excerpts: {
        ca: created.translations.ca.content,
        en: created.translations.en.content,
      },
      keywords: { ca: ['català'], en: ['english'] },
      thumbImage: created.thumbImage,
    },
  ]);

  setTime(UPDATE_TIME);
  const changedInput: Post = {
    ...structuredClone(created),
    category: { id: 'category-2', slug: 'slug-category-2' },
    sortOrder: 42,
    published: true,
    author: 'Updated Author',
    createdAt: '2024-01-01T00:00:00.000Z',
    migration: {
      source: 'supabase-backup',
      runId: 'client-cannot-change-this',
    },
    translations: {
      ...structuredClone(created.translations),
      ca: {
        ...structuredClone(created.translations.ca),
        title: 'Títol actualitzat',
        slug: 'post-1-ca-renamed',
        references: [
          reference('post-1-reference-ca-2', 1),
          reference('post-1-reference-ca-1', 0),
        ],
      },
    },
  };
  const updated = await repository.update(changedInput, 1);

  assert.equal(updated.version, 2);
  assert.equal(updated.createdAt, INITIAL_TIME);
  assert.equal(updated.updatedAt, UPDATE_TIME);
  assert.equal(updated.migration, null);
  assert.deepEqual(await repository.getById(updated.id), updated);
  assert.equal(await repository.getBySlug('ca', 'post-1-ca'), null);
  assert.deepEqual(
    await repository.getBySlug('ca', 'post-1-ca-renamed'),
    updated
  );

  const deletion = await repository.delete(updated.id, updated.version);
  assert.deepEqual(deletion, {
    postId: updated.id,
    imageKeys: ['images/post-1/main.webp', 'images/post-1/thumb.webp'],
  });
  assert.equal(await repository.getById(updated.id), null);
  assert.equal(await repository.getBySlug('ca', 'post-1-ca-renamed'), null);
  assert.equal(
    port
      .snapshot()
      .some(item =>
        ['POST', 'POST_SUMMARY', 'REFERENCE_SEGMENT', 'SLUG_LOCK'].includes(
          String(item.entityType)
        )
      ),
    false
  );
});

test('duplicate slug in either language fails without a partial write', async () => {
  const { port, repository } = testRepository();
  await repository.create(fixturePost({ id: 'post-1' }));
  const before = port.snapshot();

  await assert.rejects(
    repository.create(
      fixturePost({ id: 'post-2', caSlug: 'post-1-ca', enSlug: 'post-2-en' })
    ),
    (error: unknown) =>
      error instanceof PostSlugConflictError && error.language === 'ca'
  );
  assert.deepEqual(port.snapshot(), before);
  assert.equal(await repository.getById('post-2'), null);

  await assert.rejects(
    repository.create(
      fixturePost({ id: 'post-3', caSlug: 'post-3-ca', enSlug: 'post-1-en' })
    ),
    (error: unknown) =>
      error instanceof PostSlugConflictError && error.language === 'en'
  );
  assert.deepEqual(port.snapshot(), before);
});

test('migration create preserves legacy IDs, timestamps, and an incomplete translation', async () => {
  const { port, repository } = testRepository();
  const imported = fixturePost({ id: '64', withImages: false });
  imported.createdAt = '2025-01-02T03:04:05.000Z';
  imported.updatedAt = '2025-02-03T04:05:06.000Z';
  imported.migration = {
    source: 'supabase-backup',
    runId: 'migration-fixture-run',
  };
  imported.translations.en = {
    ...imported.translations.en,
    id: 'legacy-translation-128',
    title: '',
    slug: '',
    translationStatus: 'incomplete',
  };

  const created = await repository.create(imported);

  assert.equal(created.createdAt, imported.createdAt);
  assert.equal(created.updatedAt, imported.updatedAt);
  assert.equal(created.translations.en.id, 'legacy-translation-128');
  assert.deepEqual(await repository.getById('64'), created);
  assert.equal(await repository.getBySlug('en', ''), null);
  assert.equal(
    port.snapshot().filter(item => item.entityType === 'SLUG_LOCK').length,
    1
  );
});

test('failed slug rename retains the old lock and aggregate', async () => {
  const { port, repository } = testRepository();
  const first = await repository.create(fixturePost({ id: 'post-1' }));
  await repository.create(fixturePost({ id: 'post-2' }));
  const before = port.snapshot();
  const conflicting: Post = {
    ...structuredClone(first),
    translations: {
      ...structuredClone(first.translations),
      ca: {
        ...structuredClone(first.translations.ca),
        slug: 'post-2-ca',
      },
    },
  };

  await assert.rejects(
    repository.update(conflicting, first.version),
    PostSlugConflictError
  );
  assert.deepEqual(port.snapshot(), before);
  assert.deepEqual(await repository.getBySlug('ca', 'post-1-ca'), first);
  assert.equal((await repository.getById(first.id))?.version, 1);
});

test('a concurrent stale update returns a typed conflict and preserves the winner', async () => {
  const { repository, setTime } = testRepository();
  const original = await repository.create(fixturePost());
  const firstEditor = structuredClone(original);
  const staleEditor = structuredClone(original);

  setTime(UPDATE_TIME);
  firstEditor.author = 'First editor wins';
  const winner = await repository.update(firstEditor, 1);
  staleEditor.author = 'Stale editor loses';

  await assert.rejects(
    repository.update(staleEditor, 1),
    (error: unknown) =>
      error instanceof PostVersionConflictError && error.expectedVersion === 1
  );
  assert.deepEqual(await repository.getById(original.id), winner);
  assert.equal(winner.author, 'First editor wins');
  assert.equal(winner.version, 2);
});

test('list pagination crosses multiple DynamoDB pages deterministically', async () => {
  const { port, repository } = testRepository(1);
  for (let index = 0; index < 6; index += 1) {
    await repository.create(
      fixturePost({
        id: `post-${index}`,
        sortOrder: index,
        categoryId: index % 2 === 0 ? 'category-a' : 'category-b',
        withImages: false,
      })
    );
  }
  const queriesBefore = port.requests.queries;
  const first = await repository.list({
    limit: 2,
    direction: 'ascending',
    categoryId: 'category-b',
  });
  const second = await repository.list({
    limit: 2,
    direction: 'ascending',
    categoryId: 'category-b',
    cursor: first.nextCursor ?? undefined,
  });

  assert.deepEqual(
    first.items.map(item => item.sortOrder),
    [1, 3]
  );
  assert.ok(first.nextCursor);
  assert.deepEqual(
    second.items.map(item => item.sortOrder),
    [5]
  );
  assert.equal(second.nextCursor, null);
  assert.equal(port.requests.queries - queriesBefore > 3, true);

  const descending = await repository.list({
    limit: 6,
    direction: 'descending',
  });
  assert.deepEqual(
    descending.items.map(item => item.sortOrder),
    [5, 4, 3, 2, 1, 0]
  );
});

test('reference-heavy posts use paginated ordered segments and round trip', async () => {
  const { port, repository } = testRepository(1);
  const input = fixturePost({ withImages: false });
  input.translations.ca.references = Array.from(
    { length: 220 },
    (_, index) => ({
      id: `reference-${index}`,
      type: 'text' as const,
      reference: `https://reference.invalid/${index}/${'x'.repeat(1800)}`,
      sortOrder: index,
    })
  );

  const created = await repository.create(input);
  const segmentCount = port
    .snapshot()
    .filter(item => item.entityType === 'REFERENCE_SEGMENT').length;
  assert.equal(segmentCount > 1, true);
  const queriesBefore = port.requests.queries;
  assert.deepEqual(await repository.getById(created.id), created);
  assert.equal(port.requests.queries - queriesBefore, segmentCount);
});

test('oversized base aggregate fails before any DynamoDB request', async () => {
  const { port, repository } = testRepository();
  const oversized = fixturePost({ withImages: false });
  oversized.translations.ca.keywords = Array.from(
    { length: 5_000 },
    (_, index) => ({
      id: `keyword-${index}`,
      value: `keyword-${index}-${'x'.repeat(40)}`,
    })
  );

  await assert.rejects(
    repository.create(oversized),
    PostAggregateTooLargeError
  );
  assert.deepEqual(port.requests, { gets: 0, queries: 0, transactions: 0 });
  assert.deepEqual(port.snapshot(), []);
});

test('segment version corruption is rejected as a typed integrity error', async () => {
  const { port, repository } = testRepository(1);
  const input = fixturePost({ withImages: false });
  input.translations.ca.references = Array.from(
    { length: 220 },
    (_, index) => ({
      id: `reference-${index}`,
      type: 'text' as const,
      reference: `https://reference.invalid/${index}/${'x'.repeat(1800)}`,
      sortOrder: index,
    })
  );
  await repository.create(input);
  const corrupted = port.snapshot();
  const segment = corrupted.find(
    item => item.entityType === 'REFERENCE_SEGMENT'
  );
  assert.ok(segment);
  segment.version = 999;
  const corruptedRepository = new DynamoDbPostRepository(
    new InMemoryDynamoDbPort(corrupted, 1),
    { queryPageSize: 1 }
  );

  await assert.rejects(
    corruptedRepository.getById(input.id),
    PostDataIntegrityError
  );
});
