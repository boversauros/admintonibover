import { isDeepStrictEqual } from 'node:util';

import {
  DynamoTransactionCanceledError,
  type DynamoDbPort,
  type DynamoItem,
  type DynamoTransactionAction,
} from '../../aws/dynamodb/port';
import {
  deterministicHash,
  itemKey,
  keyFingerprint,
  postContentHash,
} from './hash';
import {
  MIGRATION_ENTITY_TYPES,
  type MigrationEntityType,
  type MigrationExecutionReport,
  type MigrationPlan,
  type MigrationRollbackReport,
  type MigrationVerificationReport,
  type PlannedItemGroup,
  type RecordFingerprint,
  type TransformedCounts,
} from './types';

type Clock = () => Date;

type PreflightResult = {
  missingKeys: Set<string>;
  unchangedItems: number;
};

type GroupWriteResult = {
  writtenItems: number;
  unchangedItems: number;
  transactionCount: number;
};

export class MigrationConflictError extends Error {
  readonly code = 'MIGRATION_TARGET_CONFLICT';

  constructor(readonly conflicts: RecordFingerprint[]) {
    super(`Migration target contains ${conflicts.length} conflicting item(s)`);
    this.name = 'MigrationConflictError';
  }
}

export class MigrationRollbackSafetyError extends Error {
  readonly code = 'MIGRATION_ROLLBACK_UNSAFE';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationRollbackSafetyError';
  }
}

function emptyCounts(): TransformedCounts {
  return Object.fromEntries(
    MIGRATION_ENTITY_TYPES.map(entityType => [entityType, 0])
  ) as TransformedCounts;
}

function entityType(item: DynamoItem): string {
  return typeof item.entityType === 'string' ? item.entityType : 'UNKNOWN';
}

function fingerprint(item: DynamoItem): RecordFingerprint {
  return {
    entityType: entityType(item),
    keyFingerprint: keyFingerprint(item),
  };
}

function sameItem(left: DynamoItem, right: DynamoItem): boolean {
  return deterministicHash(left) === deterministicHash(right);
}

function compareIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function ownsItem(item: DynamoItem, plan: MigrationPlan): boolean {
  return isDeepStrictEqual(item.migration, plan.migration);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

function revisionAction(
  plan: MigrationPlan,
  timestamp: string,
  operation: 'execute' | 'rollback'
): DynamoTransactionAction {
  return {
    type: 'increment',
    label: 'migration:revision',
    key: { PK: 'SYSTEM', SK: 'REVISION' },
    attribute: 'revision',
    by: 1,
    initialValue: 0,
    set: {
      entityType: 'DATA_REVISION',
      schemaVersion: 1,
      updatedAt: timestamp,
      lastMigration: { ...plan.migration, operation },
    },
  };
}

function elapsedMilliseconds(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

export type MigrationRunnerOptions = {
  concurrency?: number;
  scanPageSize?: number;
  clock?: Clock;
};

export class JsonDynamoDbMigrationRunner {
  private readonly concurrency: number;
  private readonly scanPageSize: number;
  private readonly clock: Clock;

  constructor(
    private readonly dynamodb: DynamoDbPort,
    options: MigrationRunnerOptions = {}
  ) {
    this.concurrency = options.concurrency ?? 2;
    this.scanPageSize = options.scanPageSize ?? 100;
    this.clock = options.clock ?? (() => new Date());
    if (
      !Number.isSafeInteger(this.concurrency) ||
      this.concurrency < 1 ||
      this.concurrency > 8
    ) {
      throw new TypeError('Migration concurrency must be between 1 and 8');
    }
    if (!Number.isSafeInteger(this.scanPageSize) || this.scanPageSize < 1) {
      throw new TypeError(
        'Migration scan page size must be a positive integer'
      );
    }
  }

  async execute(plan: MigrationPlan): Promise<MigrationExecutionReport> {
    const startedAt = this.clock();
    const preflight = await this.preflight(plan);
    const groupResults = await mapWithConcurrency(
      plan.groups,
      this.concurrency,
      group => this.writeGroup(plan, group, preflight.missingKeys)
    );
    const verification = await this.verify(plan);
    if (!verification.valid) {
      throw new MigrationConflictError([
        ...verification.missingRecords,
        ...verification.mismatchedRecords,
        ...verification.extraRecords,
      ]);
    }
    return {
      runId: plan.runId,
      writtenItems: groupResults.reduce(
        (total, result) => total + result.writtenItems,
        0
      ),
      unchangedItems:
        preflight.unchangedItems +
        groupResults.reduce(
          (total, result) => total + result.unchangedItems,
          0
        ),
      transactionCount: groupResults.reduce(
        (total, result) => total + result.transactionCount,
        0
      ),
      durationMs: elapsedMilliseconds(startedAt, this.clock()),
      verification,
    };
  }

  async verify(plan: MigrationPlan): Promise<MigrationVerificationReport> {
    const startedAt = this.clock();
    const targetItems = await this.scanAll();
    const expectedByKey = new Map(
      plan.items.map(item => [itemKey(item), item] as const)
    );
    const targetByKey = new Map(
      targetItems.map(item => [itemKey(item), item] as const)
    );
    const missingRecords: RecordFingerprint[] = [];
    const mismatchedRecords: RecordFingerprint[] = [];

    for (const expected of plan.items) {
      const target = targetByKey.get(itemKey(expected));
      if (!target) {
        missingRecords.push(fingerprint(expected));
      } else if (!sameItem(expected, target)) {
        mismatchedRecords.push(fingerprint(expected));
      }
    }

    const contentItems = targetItems.filter(item =>
      MIGRATION_ENTITY_TYPES.includes(item.entityType as MigrationEntityType)
    );
    const extraRecords = contentItems
      .filter(item => !expectedByKey.has(itemKey(item)))
      .map(fingerprint);
    const targetCounts = emptyCounts();
    for (const item of contentItems) {
      targetCounts[item.entityType as MigrationEntityType] += 1;
    }

    const postHashes = plan.posts.map(post => {
      const expectedContentItems = post.items.filter(
        item =>
          item.entityType === 'POST' || item.entityType === 'REFERENCE_SEGMENT'
      );
      const targetContentItems = expectedContentItems
        .map(item => targetByKey.get(itemKey(item)))
        .filter((item): item is DynamoItem => item !== undefined);
      const targetHash =
        targetContentItems.length === expectedContentItems.length
          ? postContentHash(targetContentItems)
          : null;
      return {
        postId: post.postId,
        sourceHash: post.contentHash,
        targetHash,
        matches: targetHash === post.contentHash,
      };
    });

    const aggregates = contentItems.filter(item => item.entityType === 'POST');
    const targetPostIds = aggregates
      .map(item => (typeof item.id === 'string' ? item.id : ''))
      .filter(id => id.length > 0)
      .sort(compareIds);
    const categoryItems = contentItems.filter(
      item => item.entityType === 'CATEGORY'
    );
    const keywordItems = contentItems.filter(
      item => item.entityType === 'KEYWORD'
    );
    const ids = (items: DynamoItem[]): string[] =>
      items
        .map(item => (typeof item.id === 'string' ? item.id : ''))
        .filter(id => id.length > 0)
        .sort(compareIds);

    return {
      valid:
        missingRecords.length === 0 &&
        mismatchedRecords.length === 0 &&
        extraRecords.length === 0 &&
        postHashes.every(post => post.matches),
      sourceCounts: { ...plan.sourceCounts },
      expectedCounts: { ...plan.transformedCounts },
      targetCounts,
      sourcePostIds: plan.posts.map(post => post.postId),
      targetPostIds,
      sourceCategoryIds: ids(
        plan.items.filter(item => item.entityType === 'CATEGORY')
      ),
      targetCategoryIds: ids(categoryItems),
      sourceKeywordIds: ids(
        plan.items.filter(item => item.entityType === 'KEYWORD')
      ),
      targetKeywordIds: ids(keywordItems),
      missingRecords,
      mismatchedRecords,
      extraRecords,
      postHashes,
      draftPostCount: aggregates.filter(item => item.published === false)
        .length,
      publishedPostCount: aggregates.filter(item => item.published === true)
        .length,
      nullMainImageCount: aggregates.filter(item => item.mainImage === null)
        .length,
      nullThumbnailImageCount: aggregates.filter(
        item => item.thumbImage === null
      ).length,
      warnings: structuredClone(plan.warnings),
      consumedCapacityUnits: null,
      durationMs: elapsedMilliseconds(startedAt, this.clock()),
    };
  }

  async rollback(plan: MigrationPlan): Promise<MigrationRollbackReport> {
    const startedAt = this.clock();
    const currentByKey = new Map<string, DynamoItem>();
    let protectedItems = 0;

    await mapWithConcurrency(plan.items, this.concurrency, async expected => {
      const current = await this.dynamodb.get(expected, true);
      if (!current) return;
      if (!ownsItem(current, plan)) {
        protectedItems += 1;
        return;
      }
      if (!sameItem(current, expected)) {
        throw new MigrationRollbackSafetyError(
          'A migration-owned item changed after import; rollback was refused'
        );
      }
      currentByKey.set(itemKey(current), current);
    });

    const results = await mapWithConcurrency(
      plan.groups,
      this.concurrency,
      group => this.deleteGroup(plan, group, currentByKey)
    );

    for (const expected of plan.items) {
      const current = await this.dynamodb.get(expected, true);
      if (current && ownsItem(current, plan) && sameItem(current, expected)) {
        throw new MigrationRollbackSafetyError(
          'Rollback verification found a migration-owned item still present'
        );
      }
    }

    return {
      runId: plan.runId,
      deletedItems: results.reduce(
        (total, result) => total + result.writtenItems,
        0
      ),
      protectedItems,
      transactionCount: results.reduce(
        (total, result) => total + result.transactionCount,
        0
      ),
      durationMs: elapsedMilliseconds(startedAt, this.clock()),
    };
  }

  private async preflight(plan: MigrationPlan): Promise<PreflightResult> {
    const missingKeys = new Set<string>();
    const conflicts: RecordFingerprint[] = [];
    let unchangedItems = 0;

    const targetItems = await this.scanAll();
    const expectedByKey = new Map(
      plan.items.map(item => [itemKey(item), item] as const)
    );
    const targetByKey = new Map(
      targetItems.map(item => [itemKey(item), item] as const)
    );

    for (const expected of plan.items) {
      const current = targetByKey.get(itemKey(expected));
      if (!current) {
        missingKeys.add(itemKey(expected));
        continue;
      }
      if (sameItem(current, expected)) {
        unchangedItems += 1;
        continue;
      }
      conflicts.push(fingerprint(expected));
    }
    for (const current of targetItems) {
      if (
        MIGRATION_ENTITY_TYPES.includes(
          current.entityType as MigrationEntityType
        ) &&
        !expectedByKey.has(itemKey(current))
      ) {
        conflicts.push(fingerprint(current));
      }
    }

    if (conflicts.length > 0) throw new MigrationConflictError(conflicts);
    return { missingKeys, unchangedItems };
  }

  private async writeGroup(
    plan: MigrationPlan,
    group: PlannedItemGroup,
    missingKeys: Set<string>
  ): Promise<GroupWriteResult> {
    const pending = group.items.filter(item => missingKeys.has(itemKey(item)));
    if (pending.length === 0) {
      return { writtenItems: 0, unchangedItems: 0, transactionCount: 0 };
    }
    const actions: DynamoTransactionAction[] = [
      ...pending.map(
        (item): DynamoTransactionAction => ({
          type: 'put',
          label: `${group.label}:put`,
          item,
          condition: { type: 'attributeNotExists', attribute: 'PK' },
        })
      ),
      revisionAction(plan, this.clock().toISOString(), 'execute'),
    ];

    try {
      await this.dynamodb.transactWrite(actions);
      return {
        writtenItems: pending.length,
        unchangedItems: 0,
        transactionCount: 1,
      };
    } catch (error) {
      if (!(error instanceof DynamoTransactionCanceledError)) throw error;
      const current = await Promise.all(
        pending.map(item => this.dynamodb.get(item, true))
      );
      if (
        current.every(
          (item, index) => item !== null && sameItem(item, pending[index])
        )
      ) {
        return {
          writtenItems: 0,
          unchangedItems: pending.length,
          transactionCount: 0,
        };
      }
      throw new MigrationConflictError(pending.map(fingerprint));
    }
  }

  private async deleteGroup(
    plan: MigrationPlan,
    group: PlannedItemGroup,
    currentByKey: Map<string, DynamoItem>
  ): Promise<GroupWriteResult> {
    const owned = group.items.filter(item => currentByKey.has(itemKey(item)));
    if (owned.length === 0) {
      return { writtenItems: 0, unchangedItems: 0, transactionCount: 0 };
    }
    const actions: DynamoTransactionAction[] = [
      ...owned.map(
        (item): DynamoTransactionAction => ({
          type: 'delete',
          label: `${group.label}:rollback`,
          key: { PK: item.PK, SK: item.SK },
          condition: {
            type: 'equals',
            attribute: 'migration',
            value: plan.migration,
          },
        })
      ),
      revisionAction(plan, this.clock().toISOString(), 'rollback'),
    ];
    try {
      await this.dynamodb.transactWrite(actions);
    } catch (error) {
      if (error instanceof DynamoTransactionCanceledError) {
        throw new MigrationRollbackSafetyError(
          'Rollback ownership changed during the operation'
        );
      }
      throw error;
    }
    return {
      writtenItems: owned.length,
      unchangedItems: 0,
      transactionCount: 1,
    };
  }

  private async scanAll(): Promise<DynamoItem[]> {
    const items: DynamoItem[] = [];
    let exclusiveStartKey: { PK: string; SK: string } | undefined;
    do {
      const page = await this.dynamodb.scan({
        exclusiveStartKey,
        limit: this.scanPageSize,
      });
      items.push(...page.items);
      exclusiveStartKey = page.lastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    return items;
  }
}
