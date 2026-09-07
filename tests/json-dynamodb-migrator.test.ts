import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { DescribeTableCommandOutput } from '@aws-sdk/client-dynamodb';

import { InMemoryDynamoDbPort } from '../lib/aws/dynamodb/in-memory-port';
import type {
  DynamoDbPort,
  DynamoItem,
  DynamoKey,
  DynamoQueryInput,
  DynamoQueryPage,
  DynamoScanInput,
  DynamoScanPage,
  DynamoTransactionAction,
} from '../lib/aws/dynamodb/port';
import {
  validateAndProjectBackupDocument,
  validateAndProjectBackupFile,
} from '../lib/migration/backup-validator';
import {
  JsonDynamoDbMigrationRunner,
  assertExecuteAllowed,
  assertRollbackAllowed,
  createMigrationPlan,
  createRunManifest,
  executeConfirmation,
  productionConfirmation,
  rollbackConfirmation,
  serializeRunManifest,
  verifyMigrationTarget,
  type MigrationPlan,
  type MigrationTarget,
} from '../lib/migration/json-dynamodb';

const fixturePath = fileURLToPath(
  new URL('./fixtures/backup-validator/sanitized-backup.json', import.meta.url)
);
const cliPath = fileURLToPath(
  new URL('../scripts/migrate-json-to-dynamodb.ts', import.meta.url)
);

const target: MigrationTarget = {
  environment: 'dev',
  accountId: '123456789012',
  region: 'eu-west-1',
  tableName: 'admintonibover-dev-disposable',
};

async function fixtureDocument(): Promise<unknown> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
}

async function fixturePlan(
  migrationTarget: MigrationTarget | null = target
): Promise<MigrationPlan> {
  const projection = validateAndProjectBackupDocument(await fixtureDocument(), {
    fileName: 'sanitized-backup.json',
    sha256: 'a'.repeat(64),
    sizeBytes: 1,
    modifiedTimeNs: '1',
  });
  return createMigrationPlan(projection, migrationTarget);
}

class FaultingPort implements DynamoDbPort {
  private transactionNumber = 0;

  constructor(
    private readonly delegate: DynamoDbPort,
    private readonly failOnTransaction: number
  ) {}

  get(key: DynamoKey, consistentRead: boolean): Promise<DynamoItem | null> {
    return this.delegate.get(key, consistentRead);
  }

  query(input: DynamoQueryInput): Promise<DynamoQueryPage> {
    return this.delegate.query(input);
  }

  scan(input: DynamoScanInput): Promise<DynamoScanPage> {
    return this.delegate.scan(input);
  }

  transactWrite(actions: DynamoTransactionAction[]): Promise<void> {
    this.transactionNumber += 1;
    if (this.transactionNumber === this.failOnTransaction) {
      throw new Error('Simulated migration interruption');
    }
    return this.delegate.transactWrite(actions);
  }
}

test('planner creates the complete current-schema write set without image items', async () => {
  const plan = await fixturePlan();

  assert.deepEqual(plan.transformedCounts, {
    POST: 2,
    POST_SUMMARY: 2,
    REFERENCE_SEGMENT: 0,
    SLUG_LOCK: 3,
    CATEGORY: 1,
    KEYWORD: 2,
  });
  assert.equal(plan.items.length, 10);
  for (const item of plan.items) {
    assert.deepEqual(item.migration, plan.migration);
  }
  assert.equal(
    plan.items.some(item => item.entityType === 'IMAGE'),
    false
  );
  assert.equal(
    plan.items.find(item => item.entityType === 'CATEGORY')?.PK,
    'TAXONOMY#CATEGORIES'
  );
  assert.equal(
    plan.items.find(item => item.entityType === 'KEYWORD')?.PK,
    'TAXONOMY#KEYWORDS'
  );
  assert.equal(
    plan.items
      .filter(item => item.entityType === 'POST')
      .every(item => item.mainImage === null && item.thumbImage === null),
    true
  );
  assert.equal(
    plan.posts[1].items.some(item => item.entityType === 'SLUG_LOCK'),
    true
  );
  assert.equal(
    plan.posts[1].items.filter(item => item.entityType === 'SLUG_LOCK').length,
    1
  );
  assert.equal(
    plan.legacy.images[0].url,
    'https://images.invalid/fixture-main.webp'
  );
});

test('input hash is checked before projection', async () => {
  const bytes = await readFile(fixturePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const projection = await validateAndProjectBackupFile(fixturePath, {
    expectedSha256: sha256,
  });
  assert.equal(projection.report.valid, true);
  await assert.rejects(
    validateAndProjectBackupFile(fixturePath, {
      expectedSha256: '0'.repeat(64),
    }),
    /does not match/
  );
});

test('dry-run planning needs no DynamoDB port and emits no content in its manifest', async () => {
  const port = new InMemoryDynamoDbPort();
  const plan = await fixturePlan(null);
  const manifest = createRunManifest({
    plan,
    mode: 'dry-run',
    status: 'dry-run',
    timestamp: '2026-09-07T10:00:00.000Z',
  });
  const serialized = serializeRunManifest(manifest);

  assert.deepEqual(port.requests, {
    gets: 0,
    queries: 0,
    scans: 0,
    transactions: 0,
  });
  assert.equal(serialized.includes('Títol fictici'), false);
  assert.equal(manifest.target.environment, 'dry-run');
  assert.equal(manifest.postHashes.length, 2);
  assert.equal(manifest.validation.anomalies.draftPostCount, 2);
  assert.equal(manifest.validation.anomalies.projectedNullMainImageCount, 2);
});

test('CLI defaults to an offline dry run and writes a private manifest', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'json-migrator-'));
  const manifestPath = join(temporaryDirectory, 'migration-run-manifest.json');
  const bytes = await readFile(fixturePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  try {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        cliPath,
        '--input',
        fixturePath,
        '--input-sha256',
        sha256,
        '--manifest',
        manifestPath,
      ],
      { encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      status: string;
      transformedCounts: { POST: number };
    };
    assert.equal(manifest.status, 'dry-run');
    assert.equal(manifest.transformedCounts.POST, 2);
    assert.equal((await stat(manifestPath)).mode & 0o077, 0);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('CLI rejects image migration flags before reading input or creating AWS access', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', cliPath, '--download-images'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown argument: --download-images/);
});

test('execute is idempotent and verifies exact target counts and hashes', async () => {
  const port = new InMemoryDynamoDbPort([], 2);
  const plan = await fixturePlan();
  const runner = new JsonDynamoDbMigrationRunner(port, {
    concurrency: 2,
    scanPageSize: 2,
  });

  const first = await runner.execute(plan);
  const afterFirst = port.snapshot();
  const transactionCount = port.requests.transactions;
  const second = await runner.execute(plan);

  assert.equal(first.writtenItems, plan.items.length);
  assert.equal(first.verification.valid, true);
  assert.equal(first.verification.draftPostCount, 2);
  assert.equal(first.verification.publishedPostCount, 0);
  assert.equal(first.verification.nullMainImageCount, 2);
  assert.equal(first.verification.nullThumbnailImageCount, 2);
  assert.equal(
    first.verification.postHashes.every(post => post.matches),
    true
  );
  assert.equal(second.writtenItems, 0);
  assert.equal(second.unchangedItems, plan.items.length);
  assert.equal(port.requests.transactions, transactionCount);
  assert.deepEqual(port.snapshot(), afterFirst);
});

test('a conflicting existing item aborts before any write', async () => {
  const plan = await fixturePlan();
  const conflicting = { ...structuredClone(plan.items[0]), version: 99 };
  const port = new InMemoryDynamoDbPort([conflicting]);
  const runner = new JsonDynamoDbMigrationRunner(port);

  await assert.rejects(runner.execute(plan), error => {
    assert.equal(
      (error as { code?: string }).code,
      'MIGRATION_TARGET_CONFLICT'
    );
    return true;
  });
  assert.equal(port.requests.transactions, 0);
  assert.deepEqual(port.snapshot(), [conflicting]);
});

test('unexpected existing content aborts preflight before any write', async () => {
  const plan = await fixturePlan();
  const unrelatedContent: DynamoItem = {
    PK: 'TAXONOMY#CATEGORIES',
    SK: 'CATEGORY#unrelated',
    entityType: 'CATEGORY',
    schemaVersion: 1,
  };
  const port = new InMemoryDynamoDbPort([unrelatedContent]);

  await assert.rejects(
    new JsonDynamoDbMigrationRunner(port).execute(plan),
    error => (error as { code?: string }).code === 'MIGRATION_TARGET_CONFLICT'
  );
  assert.equal(port.requests.transactions, 0);
  assert.deepEqual(port.snapshot(), [unrelatedContent]);
});

test('a mid-run failure resumes safely with the same deterministic run ID', async () => {
  const plan = await fixturePlan();
  const port = new InMemoryDynamoDbPort();
  const failingRunner = new JsonDynamoDbMigrationRunner(
    new FaultingPort(port, 2),
    { concurrency: 1 }
  );

  await assert.rejects(failingRunner.execute(plan), /Simulated migration/);
  assert.ok(port.snapshot().length > 0);
  assert.ok(port.snapshot().length < plan.items.length + 1);

  const resumed = await new JsonDynamoDbMigrationRunner(port, {
    concurrency: 1,
  }).execute(plan);
  assert.equal(resumed.verification.valid, true);
  assert.equal(resumed.writtenItems < plan.items.length, true);
  assert.equal(resumed.unchangedItems > 0, true);
});

test('run-ID rollback deletes only unchanged items owned by that run', async () => {
  const unrelated: DynamoItem = {
    PK: 'UNRELATED',
    SK: 'KEEP',
    entityType: 'UNRELATED',
    value: 'safe',
  };
  const plan = await fixturePlan();
  const port = new InMemoryDynamoDbPort([unrelated]);
  const runner = new JsonDynamoDbMigrationRunner(port, { concurrency: 1 });
  await runner.execute(plan);

  const rollback = await runner.rollback(plan);
  assert.equal(rollback.deletedItems, plan.items.length);
  assert.deepEqual(
    port.snapshot().filter(item => item.entityType !== 'DATA_REVISION'),
    [unrelated]
  );

  const restored = await runner.execute(plan);
  assert.equal(restored.verification.valid, true);
  assert.equal(restored.writtenItems, plan.items.length);
});

test('rollback refuses a migration-owned item changed after import', async () => {
  const plan = await fixturePlan();
  const port = new InMemoryDynamoDbPort();
  const runner = new JsonDynamoDbMigrationRunner(port, { concurrency: 1 });
  await runner.execute(plan);
  const changed = port
    .snapshot()
    .map(item =>
      item.entityType === 'POST' && item.id === '1'
        ? { ...item, author: 'changed-after-cutover' }
        : item
    );
  const changedPort = new InMemoryDynamoDbPort(changed);

  await assert.rejects(
    new JsonDynamoDbMigrationRunner(changedPort).rollback(plan),
    error => (error as { code?: string }).code === 'MIGRATION_ROLLBACK_UNSAFE'
  );
  assert.equal(changedPort.requests.transactions, 0);
});

test('production execute and rollback require the separate exact confirmation', () => {
  const productionTarget: MigrationTarget = {
    ...target,
    environment: 'prod',
    tableName: 'admintonibover-production',
  };
  const sha256 = 'b'.repeat(64);
  const runId = 'migration-production-test';

  assert.throws(
    () =>
      assertExecuteAllowed({
        target: productionTarget,
        sourceSha256: sha256,
        confirmation: executeConfirmation(productionTarget, sha256),
      }),
    /allow-production/
  );
  assert.doesNotThrow(() =>
    assertExecuteAllowed({
      target: productionTarget,
      sourceSha256: sha256,
      confirmation: executeConfirmation(productionTarget, sha256),
      allowProduction: true,
      productionConfirmation: productionConfirmation(productionTarget, sha256),
    })
  );
  assert.doesNotThrow(() =>
    assertRollbackAllowed({
      target: productionTarget,
      runId,
      sourceSha256: sha256,
      confirmation: rollbackConfirmation(productionTarget, runId),
      allowProduction: true,
      productionConfirmation: productionConfirmation(productionTarget, sha256),
    })
  );
});

test('target verification binds table ARN, Region, account, status, and key schema', async () => {
  const output: DescribeTableCommandOutput = {
    $metadata: {},
    Table: {
      TableName: target.tableName,
      TableStatus: 'ACTIVE',
      TableArn: `arn:aws:dynamodb:${target.region}:${target.accountId}:table/${target.tableName}`,
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
    },
  };
  const client = { send: async () => output };

  await assert.doesNotReject(verifyMigrationTarget(target, client));
  await assert.rejects(
    verifyMigrationTarget({ ...target, accountId: '999999999999' }, client),
    /does not match/
  );
});

test('invalid backup stops planning and valid image metadata causes no network call', async () => {
  const document = (await fixtureDocument()) as {
    tables: { post_translations: Array<{ slug: string }> };
  };
  document.tables.post_translations[3].slug = 'fictional-title';
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error('Network access is forbidden');
  }) as typeof fetch;

  try {
    const validProjection = validateAndProjectBackupDocument(
      await fixtureDocument(),
      {
        fileName: 'valid-backup.json',
        sha256: 'd'.repeat(64),
        sizeBytes: 1,
        modifiedTimeNs: '1',
      }
    );
    assert.doesNotThrow(() => createMigrationPlan(validProjection, target));

    const projection = validateAndProjectBackupDocument(document, {
      fileName: 'invalid-backup.json',
      sha256: 'c'.repeat(64),
      sizeBytes: 1,
      modifiedTimeNs: '1',
    });
    assert.throws(() => createMigrationPlan(projection, target), /validation/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
