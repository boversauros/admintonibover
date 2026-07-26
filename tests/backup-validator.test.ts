import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  estimateDynamoDbItemSize,
  serializeValidationReport,
  validateBackupDocument,
  validateBackupFile,
} from '../lib/migration/backup-validator';
import { validateAndProjectBackupDocument } from '../lib/migration/backup-validator/validator';

type FixturePost = {
  id: number;
  category_id: number;
  image_id: number | null;
  thumbnail_id: number | null;
  user_id: string;
  author: string;
  is_published: boolean;
  sort_order: number;
  date: string;
  created_at: string;
  updated_at: string;
};

type FixtureTranslation = {
  id: number;
  post_id: number;
  language_id: number;
  title: string;
  content: string;
  slug: string;
};

type FixtureReference = {
  id: number;
  post_translation_id: number;
  type: 'image' | 'text';
  reference: string;
  blockquote: string | null;
  sort_order: number;
};

type BackupFixture = {
  manifest: {
    row_counts: Record<string, number>;
  };
  tables: {
    posts: FixturePost[];
    post_translations: FixtureTranslation[];
    post_references: FixtureReference[];
  };
};

const fixturePath = fileURLToPath(
  new URL('./fixtures/backup-validator/sanitized-backup.json', import.meta.url)
);

const fixtureMetadata = {
  fileName: 'sanitized-backup.json',
  sha256: 'a'.repeat(64),
  sizeBytes: 1,
  modifiedTimeNs: '1',
};

async function loadFixture(): Promise<BackupFixture> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as BackupFixture;
}

function issueCodes(
  report: ReturnType<typeof validateBackupDocument>
): string[] {
  return report.issues.map(issue => issue.code);
}

test('DynamoDB estimator matches the AWS 23-byte scalar example', () => {
  assert.equal(
    estimateDynamoDbItemSize({
      'shirt-color': 'R',
      'shirt-size': 'M',
    }),
    23
  );
});

test('sanitized fixture validates and projects the ADR aggregate shape', async () => {
  const fixture = await loadFixture();
  const { report, projectedPosts } = validateAndProjectBackupDocument(
    fixture,
    fixtureMetadata
  );

  assert.equal(report.valid, true);
  assert.deepEqual(report.summary, {
    errorCount: 0,
    warningCount: 1,
  });
  assert.equal(report.counts.posts, 2);
  assert.equal(report.counts.post_translations, 4);
  assert.deepEqual(report.anomalies.incompleteTranslations, [
    {
      postId: '2',
      translationId: '1003',
      language: 'en',
      emptyFields: ['title', 'slug'],
    },
  ]);
  assert.equal(report.anomalies.sourceMainImageLinkCount, 1);
  assert.equal(report.anomalies.sourceThumbnailImageLinkCount, 0);
  assert.equal(report.anomalies.projectedNullMainImageCount, 2);
  assert.equal(report.anomalies.projectedNullThumbnailImageCount, 2);

  const firstPost = projectedPosts[0];
  assert.deepEqual(firstPost.aggregate, {
    PK: 'POST#1',
    SK: 'POST#1',
    entityType: 'POST',
    schemaVersion: 1,
    id: '1',
    category: {
      id: '10',
      slug: 'fixture-category',
    },
    sortOrder: 1,
    published: false,
    date: '2026-01-02',
    author: 'Fixture Author',
    createdAt: '2026-01-02T09:00:00.000Z',
    updatedAt: '2026-01-03T09:00:00.000Z',
    translations: {
      ca: {
        legacyId: '1000',
        title: 'Títol fictici',
        content: 'Contingut sanititzat per provar una traducció completa.',
        slug: 'titol-fictici',
        keywords: [{ legacyId: '3000', value: 'prova' }],
        references: [
          {
            id: '4000',
            type: 'text',
            reference: 'https://reference.invalid/catalan',
            blockquote: 'Citació fictícia i sanititzada.',
            sortOrder: 0,
          },
          {
            id: '4001',
            type: 'image',
            reference: 'https://reference.invalid/illustration.webp',
            sortOrder: 1,
          },
        ],
        translationStatus: 'complete',
      },
      en: {
        legacyId: '1001',
        title: 'Fictional title',
        content: 'Sanitized content for a complete translation.',
        slug: 'fictional-title',
        keywords: [{ legacyId: '3001', value: 'test' }],
        references: [
          {
            id: '4002',
            type: 'text',
            reference: 'https://reference.invalid/english',
            sortOrder: 0,
          },
        ],
        translationStatus: 'complete',
      },
    },
    referenceStorage: 'inline',
    mainImage: null,
    thumbImage: null,
    version: 1,
    migration: {
      source: 'supabase-backup',
      runId: `validation-${'a'.repeat(16)}`,
    },
  });
  assert.equal(
    firstPost.summary.aggregateBytes < DYNAMODB_ITEM_SIZE_GUARD_BYTES,
    true
  );
});

test('two file validations are byte-equivalent and leave the source unchanged', async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'admintonibover-validator-')
  );
  const copiedFixture = join(temporaryDirectory, 'sanitized-backup.json');

  try {
    await copyFile(fixturePath, copiedFixture);
    const beforeBytes = await readFile(copiedFixture);
    const beforeStat = await stat(copiedFixture, { bigint: true });
    const first = await validateBackupFile(copiedFixture);
    const second = await validateBackupFile(copiedFixture);
    const afterBytes = await readFile(copiedFixture);
    const afterStat = await stat(copiedFixture, { bigint: true });

    assert.equal(
      serializeValidationReport(first),
      serializeValidationReport(second)
    );
    assert.equal(
      createHash('sha256').update(beforeBytes).digest('hex'),
      createHash('sha256').update(afterBytes).digest('hex')
    );
    assert.equal(beforeStat.mtimeNs, afterStat.mtimeNs);
    assert.deepEqual(first.sourceIntegrity, {
      hashUnchanged: true,
      modificationTimeUnchanged: true,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('broken foreign key fixture fails with an actionable code', async () => {
  const fixture = await loadFixture();
  fixture.tables.posts[0].category_id = 999;

  const report = validateBackupDocument(fixture, fixtureMetadata);

  assert.equal(report.valid, false);
  assert.equal(issueCodes(report).includes('BROKEN_POST_CATEGORY_FK'), true);
});

test('duplicate normalized slug fixture fails without exposing the slug', async () => {
  const fixture = await loadFixture();
  const incompleteEnglish = fixture.tables.post_translations.find(
    translation => translation.post_id === 2 && translation.language_id === 2
  );
  assert.ok(incompleteEnglish);
  incompleteEnglish.title = 'Conflict title';
  incompleteEnglish.slug = 'Fíctional Title';

  const report = validateBackupDocument(fixture, fixtureMetadata);
  const conflict = report.issues.find(
    issue => issue.code === 'DUPLICATE_NORMALIZED_SLUG'
  );

  assert.equal(report.valid, false);
  assert.ok(conflict);
  assert.match(conflict.message, /fingerprint [0-9a-f]{12}/);
  assert.equal(conflict.message.includes('fictional-title'), false);
});

test('malformed date fixture fails with a field-specific error', async () => {
  const fixture = await loadFixture();
  fixture.tables.posts[0].date = '2026-02-30';

  const report = validateBackupDocument(fixture, fixtureMetadata);

  assert.equal(report.valid, false);
  assert.equal(issueCodes(report).includes('MALFORMED_DATE'), true);
});

test('base aggregate at the 350 KiB guard fails before any write', async () => {
  const fixture = await loadFixture();
  fixture.tables.post_translations[0].content = 'x'.repeat(
    DYNAMODB_ITEM_SIZE_GUARD_BYTES
  );

  const report = validateBackupDocument(fixture, fixtureMetadata);
  const oversized = report.issues.find(
    issue => issue.code === 'OVERSIZED_AGGREGATE'
  );

  assert.equal(report.valid, false);
  assert.ok(oversized);
  assert.match(oversized.message, /358400-byte guard/);
});

test('reference-heavy fixture uses bounded ordered segments', async () => {
  const fixture = await loadFixture();
  const extraReferences = Array.from({ length: 200 }, (_, index) => ({
    id: 5000 + index,
    post_translation_id: 1000,
    type: 'text' as const,
    reference: `fixture-${index}-${'x'.repeat(1900)}`,
    blockquote: null,
    sort_order: 10 + index,
  }));
  fixture.tables.post_references.push(...extraReferences);
  fixture.manifest.row_counts.post_references =
    fixture.tables.post_references.length;

  const { report, projectedPosts } = validateAndProjectBackupDocument(
    fixture,
    fixtureMetadata
  );
  const firstPost = projectedPosts.find(post => post.aggregate.id === '1');

  assert.equal(report.valid, true);
  assert.equal(report.projection.segmentedPostCount, 1);
  assert.ok(firstPost);
  assert.equal(firstPost.aggregate.referenceStorage, 'segmented');
  assert.equal(firstPost.referenceSegments.length > 1, true);
  assert.equal(
    firstPost.referenceSegments.every(
      segment =>
        estimateDynamoDbItemSize(segment) < DYNAMODB_ITEM_SIZE_GUARD_BYTES
    ),
    true
  );
  assert.equal(
    firstPost.referenceSegments.flatMap(segment => segment.references).length,
    fixture.tables.post_references.filter(
      reference =>
        reference.post_translation_id === 1000 ||
        reference.post_translation_id === 1001
    ).length
  );
});

test('embedded Supabase URL fixture fails without printing content', async () => {
  const fixture = await loadFixture();
  fixture.tables.post_translations[0].content =
    'See https://example.supabase.co/storage/v1/object/public/private';

  const report = validateBackupDocument(fixture, fixtureMetadata);
  const issue = report.issues.find(
    candidate => candidate.code === 'EMBEDDED_SUPABASE_URL'
  );

  assert.equal(report.valid, false);
  assert.ok(issue);
  assert.equal(issue.message.includes('example.supabase.co'), false);
});
