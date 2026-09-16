import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DescribeTableCommand,
  ListTagsOfResourceCommand,
} from '@aws-sdk/client-dynamodb';

import { createDynamoDbBackup } from '../lib/aws/admin-api/backup';
import type { DynamoDbBackupItem } from '../lib/aws/backup-contract';
import type { DynamoItem, DynamoKey } from '../lib/aws/dynamodb/port';
import {
  DynamoDbBackupRecoveryRunner,
  RECOVERY_PURPOSE,
  RecoveryTargetNotEmptyError,
  assertRestoreAllowed,
  restoreConfirmation,
  verifyRecoveryTarget,
  type DynamoDbRecoveryPort,
  type RecoveryTarget,
  type RecoveryTargetClient,
} from '../lib/recovery/dynamodb-backup';

const EXPORTED_AT = '2026-09-15T10:00:00.000Z';
const target: RecoveryTarget = {
  accountId: '123456789012',
  region: 'eu-west-1',
  tableName: 'admintonibover-recovery-table',
  runId: 'recovery-20260915-a1b2c3d4',
};

function backup() {
  const items: DynamoItem[] = [
    {
      PK: 'SYSTEM',
      SK: 'REVISION',
      entityType: 'DATA_REVISION',
      schemaVersion: 1,
      revision: 102,
      updatedAt: EXPORTED_AT,
    },
    {
      PK: 'POST#1',
      SK: 'POST#1',
      entityType: 'POST',
      schemaVersion: 1,
      id: '1',
      version: 1,
    },
    {
      PK: 'POSTS',
      SK: 'ORDER#1',
      entityType: 'POST_SUMMARY',
      schemaVersion: 1,
      id: '1',
      version: 1,
    },
  ];
  return createDynamoDbBackup({
    items,
    pageCount: 1,
    exportedAt: EXPORTED_AT,
    environment: 'prod',
  });
}

function key(item: Pick<DynamoDbBackupItem, 'PK' | 'SK'>): string {
  return `${item.PK}\u0000${item.SK}`;
}

class MemoryRecoveryPort implements DynamoDbRecoveryPort {
  readonly items = new Map<string, DynamoDbBackupItem>();
  calls = 0;
  returnOneUnprocessed = false;

  constructor(initial: DynamoDbBackupItem[] = []) {
    for (const item of initial)
      this.items.set(key(item), structuredClone(item));
  }

  async scan(input: { limit: number; exclusiveStartKey?: DynamoKey }): Promise<{
    items: DynamoDbBackupItem[];
    lastEvaluatedKey?: DynamoKey;
  }> {
    const sorted = [...this.items.values()].sort((left, right) =>
      key(left).localeCompare(key(right))
    );
    const startKey = input.exclusiveStartKey;
    const start = startKey
      ? sorted.findIndex(item => key(item) === key(startKey)) + 1
      : 0;
    const page = sorted.slice(start, start + input.limit);
    const hasMore = start + page.length < sorted.length;
    return {
      items: structuredClone(page),
      ...(hasMore && page.length > 0
        ? {
            lastEvaluatedKey: {
              PK: page.at(-1)!.PK,
              SK: page.at(-1)!.SK,
            },
          }
        : {}),
    };
  }

  async batchPut(items: DynamoDbBackupItem[]): Promise<DynamoDbBackupItem[]> {
    this.calls += 1;
    const unprocessed = this.returnOneUnprocessed ? items.slice(0, 1) : [];
    this.returnOneUnprocessed = false;
    for (const item of items.slice(unprocessed.length)) {
      this.items.set(key(item), structuredClone(item));
    }
    return structuredClone(unprocessed);
  }
}

test('restore guard requires an exact run-bound confirmation and forbids production targets', () => {
  const source = backup();
  assert.doesNotThrow(() =>
    assertRestoreAllowed({
      target,
      itemsSha256: source.manifest.sha256,
      confirmation: restoreConfirmation(target, source.manifest.sha256),
    })
  );
  assert.throws(
    () =>
      assertRestoreAllowed({
        target,
        itemsSha256: source.manifest.sha256,
        confirmation: 'RESTORE something-else',
      }),
    /confirmation/
  );
  assert.throws(
    () =>
      assertRestoreAllowed({
        target: { ...target, tableName: 'admintonibover-prod-content' },
        itemsSha256: source.manifest.sha256,
        confirmation: 'irrelevant',
      }),
    /Production-looking/
  );
});

test('target verification binds ARN, schema, billing, deletion mode, and run tags', async () => {
  const arn = `arn:aws:dynamodb:${target.region}:${target.accountId}:table/${target.tableName}`;
  const client = {
    async send(command: unknown) {
      if (command instanceof DescribeTableCommand) {
        return {
          $metadata: {},
          Table: {
            TableName: target.tableName,
            TableArn: arn,
            TableStatus: 'ACTIVE',
            BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
            DeletionProtectionEnabled: false,
            KeySchema: [
              { AttributeName: 'PK', KeyType: 'HASH' },
              { AttributeName: 'SK', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
              { AttributeName: 'PK', AttributeType: 'S' },
              { AttributeName: 'SK', AttributeType: 'S' },
            ],
          },
        };
      }
      assert.ok(command instanceof ListTagsOfResourceCommand);
      return {
        $metadata: {},
        Tags: [
          { Key: 'Project', Value: 'admintonibover' },
          { Key: 'Environment', Value: 'dev' },
          { Key: 'Purpose', Value: RECOVERY_PURPOSE },
          { Key: 'RecoveryRunId', Value: target.runId },
        ],
      };
    },
  } as unknown as RecoveryTargetClient;

  await assert.doesNotReject(verifyRecoveryTarget(target, client));
  await assert.rejects(
    verifyRecoveryTarget({ ...target, runId: 'recovery-wrong-run-id' }, client),
    /tags/
  );
});

test('recovery writes bounded batches, retries unprocessed items, and reconciles exactly', async () => {
  const source = backup();
  const port = new MemoryRecoveryPort();
  port.returnOneUnprocessed = true;
  const sleeps: number[] = [];
  const runner = new DynamoDbBackupRecoveryRunner(port, {
    scanPageSize: 2,
    retryDelaysMs: [5],
    sleep: async milliseconds => {
      sleeps.push(milliseconds);
    },
  });
  const result = await runner.restore(source);

  assert.equal(result.writtenItemCount, source.items.length);
  assert.equal(result.batchCount, 1);
  assert.equal(result.retryCount, 1);
  assert.deepEqual(sleeps, [5]);
  assert.equal(port.calls, 2);
  assert.equal(result.verification.valid, true);
  assert.equal(
    result.verification.expectedCanonicalSha256,
    result.verification.targetCanonicalSha256
  );
  assert.deepEqual(
    result.verification.expectedEntityCounts,
    result.verification.targetEntityCounts
  );
});

test('recovery refuses a non-empty table before writing', async () => {
  const source = backup();
  const port = new MemoryRecoveryPort([source.items[0]]);
  const runner = new DynamoDbBackupRecoveryRunner(port);
  await assert.rejects(
    runner.restore(source),
    error => error instanceof RecoveryTargetNotEmptyError
  );
  assert.equal(port.calls, 0);
});
