import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  DescribeTableCommand,
  DynamoDBClient,
  ListTagsOfResourceCommand,
  type DescribeTableCommandOutput,
  type ListTagsOfResourceCommandOutput,
} from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

import {
  RESTORABLE_ENTITY_TYPES,
  entityCounts,
  type DynamoDbBackupItem,
  type DynamoDbBackupV2,
  type RestorableEntityType,
} from '@/lib/aws/backup-contract';
import { validateDynamoDbBackup } from '@/lib/aws/admin-api/backup';
import {
  canonicalJson,
  deterministicHash,
  itemKey,
} from '@/lib/aws/dynamodb/hash';
import type { DynamoKey } from '@/lib/aws/dynamodb/port';

export const RECOVERY_PURPOSE = 'AWS-BACKUP-RESTORE';
export const RECOVERY_RUN_ID_PATTERN = /^recovery-[a-z0-9-]{8,40}$/;

const DEFAULT_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 4_000];
const DEFAULT_SCAN_PAGE_SIZE = 100;

type Sleep = (milliseconds: number) => Promise<void>;

export type RecoveryTarget = {
  accountId: string;
  region: string;
  tableName: string;
  runId: string;
};

export type RecoveryScanPage = {
  items: DynamoDbBackupItem[];
  lastEvaluatedKey?: DynamoKey;
};

export interface DynamoDbRecoveryPort {
  scan(input: {
    limit: number;
    exclusiveStartKey?: DynamoKey;
  }): Promise<RecoveryScanPage>;
  batchPut(items: DynamoDbBackupItem[]): Promise<DynamoDbBackupItem[]>;
}

export type BackupFile = {
  backup: DynamoDbBackupV2;
  fileSha256: string;
  sizeBytes: number;
};

export type RecoveryVerification = {
  valid: boolean;
  expectedItemCount: number;
  targetItemCount: number;
  expectedEntityCounts: Record<RestorableEntityType, number>;
  targetEntityCounts: Record<RestorableEntityType, number>;
  expectedRevision: number | null;
  targetRevision: number | null;
  expectedCanonicalSha256: string;
  targetCanonicalSha256: string;
  missingItemCount: number;
  mismatchedItemCount: number;
  extraItemCount: number;
};

export type RecoveryExecution = {
  writtenItemCount: number;
  batchCount: number;
  retryCount: number;
  verification: RecoveryVerification;
};

export type RecoveryTargetClient = {
  send(command: DescribeTableCommand): Promise<DescribeTableCommandOutput>;
  send(
    command: ListTagsOfResourceCommand
  ): Promise<ListTagsOfResourceCommandOutput>;
};

export class RecoveryBackupError extends Error {
  readonly code = 'RECOVERY_BACKUP_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'RecoveryBackupError';
  }
}

export class RecoveryTargetError extends Error {
  readonly code = 'RECOVERY_TARGET_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'RecoveryTargetError';
  }
}

export class RecoveryTargetNotEmptyError extends Error {
  readonly code = 'RECOVERY_TARGET_NOT_EMPTY';

  constructor() {
    super('Recovery target must be empty before any item is written');
    this.name = 'RecoveryTargetNotEmptyError';
  }
}

export class RecoveryWriteError extends Error {
  readonly code = 'RECOVERY_WRITE_INCOMPLETE';

  constructor(readonly unprocessedItemCount: number) {
    super(
      `DynamoDB did not accept ${unprocessedItemCount} item(s) after bounded retries`
    );
    this.name = 'RecoveryWriteError';
  }
}

export class RecoveryVerificationError extends Error {
  readonly code = 'RECOVERY_VERIFICATION_FAILED';

  constructor(readonly verification: RecoveryVerification) {
    super(
      `Recovery verification failed (${verification.missingItemCount} missing, ${verification.mismatchedItemCount} mismatched, ${verification.extraItemCount} extra)`
    );
    this.name = 'RecoveryVerificationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fileSha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

function compareItems(
  left: Pick<DynamoDbBackupItem, 'PK' | 'SK'>,
  right: Pick<DynamoDbBackupItem, 'PK' | 'SK'>
): number {
  return itemKey(left).localeCompare(itemKey(right));
}

function canonicalItemsSha256(items: DynamoDbBackupItem[]): string {
  return deterministicHash([...items].sort(compareItems));
}

function revision(items: DynamoDbBackupItem[]): number | null {
  const value = items.find(
    item => item.entityType === 'DATA_REVISION'
  )?.revision;
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function targetCounts(
  items: DynamoDbBackupItem[]
): Record<RestorableEntityType, number> {
  const counts = Object.fromEntries(
    RESTORABLE_ENTITY_TYPES.map(entityType => [entityType, 0])
  ) as Record<RestorableEntityType, number>;
  for (const item of items) counts[item.entityType] += 1;
  return counts;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function chunked<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function assertStringKey(item: Record<string, unknown>): DynamoDbBackupItem {
  if (
    typeof item.PK !== 'string' ||
    typeof item.SK !== 'string' ||
    !RESTORABLE_ENTITY_TYPES.includes(item.entityType as RestorableEntityType)
  ) {
    throw new RecoveryWriteError(1);
  }
  return item as DynamoDbBackupItem;
}

export async function readBackupFile(path: string): Promise<BackupFile> {
  const contents = await readFile(path);
  let value: unknown;
  try {
    value = JSON.parse(contents.toString('utf8')) as unknown;
  } catch {
    throw new RecoveryBackupError('Backup is not valid JSON');
  }
  const issues = validateDynamoDbBackup(value);
  if (issues.length > 0) {
    throw new RecoveryBackupError(
      `Backup contract validation failed: ${issues[0].code} at ${issues[0].path}`
    );
  }
  return {
    backup: value as DynamoDbBackupV2,
    fileSha256: fileSha256(contents),
    sizeBytes: contents.byteLength,
  };
}

export function restoreConfirmation(
  target: RecoveryTarget,
  itemsSha256: string
): string {
  return `RESTORE ${target.runId} ${target.accountId}/${target.region}/${target.tableName} ${itemsSha256}`;
}

export function assertRestoreAllowed(input: {
  target: RecoveryTarget;
  itemsSha256: string;
  confirmation?: string;
}): void {
  const { target } = input;
  if (!/^\d{12}$/.test(target.accountId)) {
    throw new RecoveryTargetError('AWS account ID must contain 12 digits');
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(target.region)) {
    throw new RecoveryTargetError('AWS Region is invalid');
  }
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(target.tableName)) {
    throw new RecoveryTargetError('DynamoDB table name is invalid');
  }
  if (!RECOVERY_RUN_ID_PATTERN.test(target.runId)) {
    throw new RecoveryTargetError('Recovery run ID is invalid');
  }
  if (/prod/i.test(target.tableName)) {
    throw new RecoveryTargetError('Production-looking tables are forbidden');
  }
  if (input.confirmation !== restoreConfirmation(target, input.itemsSha256)) {
    throw new RecoveryTargetError('Restore confirmation does not match');
  }
}

export async function verifyRecoveryTarget(
  target: RecoveryTarget,
  client: RecoveryTargetClient
): Promise<void> {
  const result = await client.send(
    new DescribeTableCommand({ TableName: target.tableName })
  );
  const table = result.Table;
  const expectedArn = `arn:aws:dynamodb:${target.region}:${target.accountId}:table/${target.tableName}`;
  if (
    !table ||
    table.TableName !== target.tableName ||
    table.TableArn !== expectedArn ||
    table.TableStatus !== 'ACTIVE'
  ) {
    throw new RecoveryTargetError(
      'Table identity, account, Region, or status did not match'
    );
  }
  if (
    table.KeySchema?.length !== 2 ||
    table.KeySchema.find(key => key.KeyType === 'HASH')?.AttributeName !==
      'PK' ||
    table.KeySchema.find(key => key.KeyType === 'RANGE')?.AttributeName !== 'SK'
  ) {
    throw new RecoveryTargetError('Table must use the PK/SK key schema');
  }
  if (
    table.AttributeDefinitions?.find(item => item.AttributeName === 'PK')
      ?.AttributeType !== 'S' ||
    table.AttributeDefinitions?.find(item => item.AttributeName === 'SK')
      ?.AttributeType !== 'S'
  ) {
    throw new RecoveryTargetError('Table PK/SK keys must be strings');
  }
  if (table.BillingModeSummary?.BillingMode !== 'PAY_PER_REQUEST') {
    throw new RecoveryTargetError('Table must use on-demand billing');
  }
  if (table.DeletionProtectionEnabled !== false) {
    throw new RecoveryTargetError('Disposable table must not protect deletion');
  }

  const tagsResult = await client.send(
    new ListTagsOfResourceCommand({ ResourceArn: table.TableArn })
  );
  const tags = new Map(
    (tagsResult.Tags ?? []).map(tag => [tag.Key ?? '', tag.Value ?? ''])
  );
  if (
    tags.get('Project') !== 'admintonibover' ||
    tags.get('Environment') !== 'dev' ||
    tags.get('Purpose') !== RECOVERY_PURPOSE ||
    tags.get('RecoveryRunId') !== target.runId
  ) {
    throw new RecoveryTargetError(
      'Disposable recovery tags do not match this project and run'
    );
  }
}

export class AwsDynamoDbRecoveryPort implements DynamoDbRecoveryPort {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBDocumentClient
  ) {}

  async scan(input: {
    limit: number;
    exclusiveStartKey?: DynamoKey;
  }): Promise<RecoveryScanPage> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        ConsistentRead: true,
        Limit: input.limit,
        ExclusiveStartKey: input.exclusiveStartKey,
      })
    );
    const items = (result.Items ?? []).map(assertStringKey);
    const paginationKey = result.LastEvaluatedKey;
    return {
      items,
      ...(paginationKey
        ? {
            lastEvaluatedKey: {
              PK: String(paginationKey.PK),
              SK: String(paginationKey.SK),
            },
          }
        : {}),
    };
  }

  async batchPut(items: DynamoDbBackupItem[]): Promise<DynamoDbBackupItem[]> {
    if (items.length < 1 || items.length > 25) {
      throw new TypeError('Recovery batch size must be between 1 and 25');
    }
    const result = await this.client.send(
      new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: items.map(item => ({ PutRequest: { Item: item } })),
        },
      })
    );
    return (result.UnprocessedItems?.[this.tableName] ?? []).map(request => {
      if (!request.PutRequest?.Item) throw new RecoveryWriteError(1);
      return assertStringKey(request.PutRequest.Item);
    });
  }
}

export function createRecoveryPort(
  tableName: string,
  client: DynamoDBClient
): AwsDynamoDbRecoveryPort {
  return new AwsDynamoDbRecoveryPort(
    tableName,
    DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    })
  );
}

export type RecoveryRunnerOptions = {
  retryDelaysMs?: number[];
  scanPageSize?: number;
  sleep?: Sleep;
};

export class DynamoDbBackupRecoveryRunner {
  private readonly retryDelaysMs: number[];
  private readonly scanPageSize: number;
  private readonly sleep: Sleep;

  constructor(
    private readonly port: DynamoDbRecoveryPort,
    options: RecoveryRunnerOptions = {}
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.scanPageSize = options.scanPageSize ?? DEFAULT_SCAN_PAGE_SIZE;
    this.sleep = options.sleep ?? defaultSleep;
    if (
      this.retryDelaysMs.some(
        delay => !Number.isSafeInteger(delay) || delay < 0
      )
    ) {
      throw new TypeError(
        'Recovery retry delays must be non-negative integers'
      );
    }
    if (!Number.isSafeInteger(this.scanPageSize) || this.scanPageSize < 1) {
      throw new TypeError('Recovery scan page size must be a positive integer');
    }
  }

  async restore(backup: DynamoDbBackupV2): Promise<RecoveryExecution> {
    const existing = await this.port.scan({ limit: 1 });
    if (existing.items.length > 0) throw new RecoveryTargetNotEmptyError();

    let retryCount = 0;
    const batches = chunked(backup.items, 25);
    for (const batch of batches) {
      let remaining = batch;
      for (let attempt = 0; remaining.length > 0; attempt += 1) {
        remaining = await this.port.batchPut(remaining);
        if (remaining.length === 0) break;
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) throw new RecoveryWriteError(remaining.length);
        retryCount += 1;
        await this.sleep(delay);
      }
    }

    const verification = await this.verify(backup);
    if (!verification.valid) throw new RecoveryVerificationError(verification);
    return {
      writtenItemCount: backup.items.length,
      batchCount: batches.length,
      retryCount,
      verification,
    };
  }

  async verify(backup: DynamoDbBackupV2): Promise<RecoveryVerification> {
    const targetItems = await this.scanAll();
    const expectedByKey = new Map(
      backup.items.map(item => [itemKey(item), item] as const)
    );
    const targetByKey = new Map(
      targetItems.map(item => [itemKey(item), item] as const)
    );
    let missingItemCount = 0;
    let mismatchedItemCount = 0;
    for (const expected of backup.items) {
      const target = targetByKey.get(itemKey(expected));
      if (!target) missingItemCount += 1;
      else if (canonicalJson(target) !== canonicalJson(expected)) {
        mismatchedItemCount += 1;
      }
    }
    const extraItemCount = targetItems.filter(
      item => !expectedByKey.has(itemKey(item))
    ).length;
    const expectedCanonicalSha256 = canonicalItemsSha256(backup.items);
    const targetCanonicalSha256 = canonicalItemsSha256(targetItems);
    const counts = targetCounts(targetItems);
    const targetRevision = revision(targetItems);
    const valid =
      missingItemCount === 0 &&
      mismatchedItemCount === 0 &&
      extraItemCount === 0 &&
      targetCanonicalSha256 === expectedCanonicalSha256 &&
      targetRevision === backup.manifest.revision;
    return {
      valid,
      expectedItemCount: backup.items.length,
      targetItemCount: targetItems.length,
      expectedEntityCounts: entityCounts(backup.items),
      targetEntityCounts: counts,
      expectedRevision: backup.manifest.revision,
      targetRevision,
      expectedCanonicalSha256,
      targetCanonicalSha256,
      missingItemCount,
      mismatchedItemCount,
      extraItemCount,
    };
  }

  private async scanAll(): Promise<DynamoDbBackupItem[]> {
    const items: DynamoDbBackupItem[] = [];
    let exclusiveStartKey: DynamoKey | undefined;
    do {
      const page = await this.port.scan({
        limit: this.scanPageSize,
        ...(exclusiveStartKey ? { exclusiveStartKey } : {}),
      });
      items.push(...page.items);
      exclusiveStartKey = page.lastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    return items;
  }
}

export function recoveryFailure(error: unknown): {
  code: string;
  message: string;
} {
  if (!isRecord(error)) {
    return {
      code: 'RECOVERY_FAILED',
      message: 'Recovery failed without a safe error message',
    };
  }
  return {
    code:
      typeof error.code === 'string'
        ? error.code
        : typeof error.name === 'string'
          ? error.name
          : 'RECOVERY_FAILED',
    message:
      typeof error.message === 'string'
        ? error.message
        : 'Recovery failed without a safe error message',
  };
}
