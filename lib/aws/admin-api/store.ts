import { createHash } from 'node:crypto';

import type { PostLanguage } from '@/lib/domain/posts/types';
import {
  DynamoTransactionCanceledError,
  type DynamoDbPort,
  type DynamoItem,
  type DynamoKey,
  type DynamoTransactionAction,
} from '@/lib/aws/dynamodb/port';

export type AdminCategory = {
  id: string;
  slug: string;
  names: Record<PostLanguage, string>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminKeyword = {
  id: string;
  language: PostLanguage;
  value: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredMutationResult = Record<string, unknown>;

export type MutationReservation =
  | {
      state: 'reserved';
      key: DynamoKey;
      requestDigest: string;
      resumed: boolean;
      context?: StoredMutationResult;
    }
  | { state: 'replay'; result: StoredMutationResult };

export class AdminStoreConflictError extends Error {
  readonly code = 'ADMIN_STORE_CONFLICT';

  constructor(readonly reason: 'idempotency' | 'backup') {
    super('The requested change conflicts with current state');
    this.name = 'AdminStoreConflictError';
  }
}

const CATEGORY_PARTITION = 'TAXONOMY#CATEGORIES';
const KEYWORD_PARTITION = 'TAXONOMY#KEYWORDS';
const SYSTEM_REVISION_KEY: DynamoKey = { PK: 'SYSTEM', SK: 'REVISION' };
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_STORED_RESULT_BYTES = 32 * 1024;

function mutationKey(scope: string, subject: string, key: string): DynamoKey {
  const digest = createHash('sha256')
    .update(`${scope}\u0000${subject}\u0000${key}`, 'utf8')
    .digest('hex');
  return { PK: `IDEMPOTENCY#${digest}`, SK: `IDEMPOTENCY#${digest}` };
}

function revisionAction(updatedAt: string): DynamoTransactionAction {
  return {
    type: 'increment',
    label: 'revision',
    key: SYSTEM_REVISION_KEY,
    attribute: 'revision',
    by: 1,
    initialValue: 0,
    set: {
      entityType: 'DATA_REVISION',
      schemaVersion: 1,
      updatedAt,
    },
  };
}

function stringValue(item: DynamoItem, attribute: string): string {
  const value = item[attribute];
  if (typeof value !== 'string') {
    throw new TypeError(`Stored admin item has invalid ${attribute}`);
  }
  return value;
}

function numberValue(item: DynamoItem, attribute: string): number {
  const value = item[attribute];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Stored admin item has invalid ${attribute}`);
  }
  return value as number;
}

function recordValue(
  item: DynamoItem,
  attribute: string
): Record<string, unknown> {
  const value = item[attribute];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Stored admin item has invalid ${attribute}`);
  }
  return value as Record<string, unknown>;
}

function categoryFromItem(item: DynamoItem): AdminCategory {
  if (item.entityType !== 'CATEGORY' || item.schemaVersion !== 1) {
    throw new TypeError('DynamoDB item is not a category');
  }
  const names = recordValue(item, 'names');
  if (typeof names.ca !== 'string' || typeof names.en !== 'string') {
    throw new TypeError('Stored category has invalid names');
  }
  return {
    id: stringValue(item, 'id'),
    slug: stringValue(item, 'slug'),
    names: {
      ca: names.ca,
      en: names.en,
    },
    version: numberValue(item, 'version'),
    createdAt: stringValue(item, 'createdAt'),
    updatedAt: stringValue(item, 'updatedAt'),
  };
}

function keywordFromItem(item: DynamoItem): AdminKeyword {
  if (item.entityType !== 'KEYWORD' || item.schemaVersion !== 1) {
    throw new TypeError('DynamoDB item is not a keyword');
  }
  const language = stringValue(item, 'language');
  if (language !== 'ca' && language !== 'en') {
    throw new TypeError('Stored keyword has invalid language');
  }
  return {
    id: stringValue(item, 'id'),
    language,
    value: stringValue(item, 'value'),
    version: numberValue(item, 'version'),
    createdAt: stringValue(item, 'createdAt'),
    updatedAt: stringValue(item, 'updatedAt'),
  };
}

function completedResult(item: DynamoItem): StoredMutationResult {
  if (
    item.entityType !== 'IDEMPOTENCY' ||
    item.schemaVersion !== 1 ||
    item.status !== 'completed'
  ) {
    throw new AdminStoreConflictError('idempotency');
  }
  return structuredClone(recordValue(item, 'result'));
}

export class DynamoDbAdminStore {
  constructor(
    private readonly dynamodb: DynamoDbPort,
    private readonly clock: () => Date = () => new Date(),
    private readonly queryPageSize = 50
  ) {
    if (!Number.isSafeInteger(queryPageSize) || queryPageSize < 1) {
      throw new TypeError('queryPageSize must be a positive integer');
    }
  }

  async listCategories(): Promise<AdminCategory[]> {
    const items = await this.queryPartition(CATEGORY_PARTITION);
    return items
      .map(categoryFromItem)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async listKeywords(language?: PostLanguage): Promise<AdminKeyword[]> {
    const items = await this.queryPartition(KEYWORD_PARTITION);
    return items
      .map(keywordFromItem)
      .filter(
        keyword => language === undefined || keyword.language === language
      )
      .sort((left, right) => left.value.localeCompare(right.value));
  }

  async reserveMutation(input: {
    scope: string;
    subject: string;
    key: string;
    requestDigest: string;
    resumePending?: boolean;
    pendingContext?: StoredMutationResult;
  }): Promise<MutationReservation> {
    const key = mutationKey(input.scope, input.subject, input.key);
    const existing = await this.dynamodb.get(key, true);
    if (existing) {
      return this.resolveReservation(
        existing,
        input.requestDigest,
        input.resumePending
      );
    }

    if (
      input.pendingContext &&
      Buffer.byteLength(JSON.stringify(input.pendingContext), 'utf8') >
        MAX_STORED_RESULT_BYTES
    ) {
      throw new RangeError('Idempotency context exceeds 32 KiB');
    }

    const now = this.clock();
    try {
      await this.dynamodb.transactWrite([
        {
          type: 'put',
          label: 'idempotency:reserve',
          item: {
            ...key,
            entityType: 'IDEMPOTENCY',
            schemaVersion: 1,
            requestDigest: input.requestDigest,
            status: 'pending',
            ...(input.pendingContext
              ? { context: structuredClone(input.pendingContext) }
              : {}),
            createdAt: now.toISOString(),
            expiresAt:
              Math.floor(now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS,
          },
          condition: { type: 'attributeNotExists', attribute: 'PK' },
        },
        revisionAction(now.toISOString()),
      ]);
      return {
        state: 'reserved',
        key,
        requestDigest: input.requestDigest,
        resumed: false,
        ...(input.pendingContext
          ? { context: structuredClone(input.pendingContext) }
          : {}),
      };
    } catch (error) {
      if (!(error instanceof DynamoTransactionCanceledError)) throw error;
      const raced = await this.dynamodb.get(key, true);
      if (!raced) throw new AdminStoreConflictError('idempotency');
      return this.resolveReservation(
        raced,
        input.requestDigest,
        input.resumePending
      );
    }
  }

  async findMutation(input: {
    scope: string;
    subject: string;
    key: string;
    requestDigest: string;
    resumePending?: boolean;
  }): Promise<MutationReservation | null> {
    const existing = await this.dynamodb.get(
      mutationKey(input.scope, input.subject, input.key),
      true
    );
    return existing
      ? this.resolveReservation(
          existing,
          input.requestDigest,
          input.resumePending
        )
      : null;
  }

  async completeMutation(
    reservation: Extract<MutationReservation, { state: 'reserved' }>,
    result: StoredMutationResult
  ): Promise<void> {
    const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (bytes > MAX_STORED_RESULT_BYTES) {
      throw new RangeError('Idempotency result exceeds 32 KiB');
    }
    const now = this.clock();
    try {
      await this.dynamodb.transactWrite([
        {
          type: 'put',
          label: 'idempotency:complete',
          item: {
            ...reservation.key,
            entityType: 'IDEMPOTENCY',
            schemaVersion: 1,
            requestDigest: reservation.requestDigest,
            status: 'completed',
            result: structuredClone(result),
            completedAt: now.toISOString(),
            expiresAt:
              Math.floor(now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS,
          },
          condition: {
            type: 'equals',
            attribute: 'requestDigest',
            value: reservation.requestDigest,
          },
        },
        revisionAction(now.toISOString()),
      ]);
    } catch (error) {
      if (error instanceof DynamoTransactionCanceledError) {
        throw new AdminStoreConflictError('idempotency');
      }
      throw error;
    }
  }

  async scanAll(pageSize = 100): Promise<{
    items: DynamoItem[];
    pageCount: number;
  }> {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new TypeError('Backup page size must be between 1 and 100');
    }
    const revisionBefore = await this.dataRevision();
    const items: DynamoItem[] = [];
    let pageCount = 0;
    let exclusiveStartKey: DynamoKey | undefined;
    do {
      const page = await this.dynamodb.scan({
        exclusiveStartKey,
        limit: pageSize,
      });
      items.push(...page.items);
      pageCount += 1;
      exclusiveStartKey = page.lastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    const revisionAfter = await this.dataRevision();
    if (revisionBefore !== revisionAfter) {
      throw new AdminStoreConflictError('backup');
    }
    return { items, pageCount };
  }

  private async dataRevision(): Promise<number | null> {
    const item = await this.dynamodb.get(SYSTEM_REVISION_KEY, true);
    if (!item) return null;
    const value = item.revision;
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new TypeError('Stored data revision is invalid');
    }
    return value as number;
  }

  private async queryPartition(partitionKey: string): Promise<DynamoItem[]> {
    const items: DynamoItem[] = [];
    let exclusiveStartKey: DynamoKey | undefined;
    do {
      const page = await this.dynamodb.query({
        partitionKey,
        consistentRead: true,
        scanIndexForward: true,
        exclusiveStartKey,
        limit: this.queryPageSize,
      });
      items.push(...page.items);
      exclusiveStartKey = page.lastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    return items;
  }

  private resolveReservation(
    item: DynamoItem,
    requestDigest: string,
    resumePending = false
  ): MutationReservation {
    if (
      item.entityType !== 'IDEMPOTENCY' ||
      item.schemaVersion !== 1 ||
      item.requestDigest !== requestDigest
    ) {
      throw new AdminStoreConflictError('idempotency');
    }
    if (item.status === 'completed') {
      return { state: 'replay', result: completedResult(item) };
    }
    if (item.status === 'pending' && resumePending) {
      return {
        state: 'reserved',
        key: { PK: item.PK, SK: item.SK },
        requestDigest,
        resumed: true,
        ...(item.context === undefined
          ? {}
          : { context: structuredClone(recordValue(item, 'context')) }),
      };
    }
    throw new AdminStoreConflictError('idempotency');
  }
}
