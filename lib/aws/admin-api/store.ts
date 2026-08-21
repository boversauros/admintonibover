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
  | { state: 'reserved'; key: DynamoKey; requestDigest: string }
  | { state: 'replay'; result: StoredMutationResult };

export class AdminStoreConflictError extends Error {
  readonly code = 'ADMIN_STORE_CONFLICT';

  constructor(readonly reason: 'version' | 'idempotency' | 'backup') {
    super('The requested change conflicts with current state');
    this.name = 'AdminStoreConflictError';
  }
}

export class AdminStoreNotFoundError extends Error {
  readonly code = 'ADMIN_STORE_NOT_FOUND';

  constructor(readonly resource: 'category' | 'keyword') {
    super(`${resource} not found`);
    this.name = 'AdminStoreNotFoundError';
  }
}

const CATEGORY_PARTITION = 'TAXONOMY#CATEGORIES';
const KEYWORD_PARTITION = 'TAXONOMY#KEYWORDS';
const SYSTEM_REVISION_KEY: DynamoKey = { PK: 'SYSTEM', SK: 'REVISION' };
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_STORED_RESULT_BYTES = 32 * 1024;

function categoryKey(id: string): DynamoKey {
  return { PK: CATEGORY_PARTITION, SK: `CATEGORY#${id}` };
}

function keywordKey(id: string): DynamoKey {
  return { PK: KEYWORD_PARTITION, SK: `KEYWORD#${id}` };
}

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

  async getCategory(id: string): Promise<AdminCategory | null> {
    const item = await this.dynamodb.get(categoryKey(id), true);
    return item ? categoryFromItem(item) : null;
  }

  async createCategory(
    input: Pick<AdminCategory, 'id' | 'slug' | 'names'>
  ): Promise<AdminCategory> {
    const timestamp = this.clock().toISOString();
    const category: AdminCategory = {
      ...structuredClone(input),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.writeTaxonomyItem(
      {
        ...categoryKey(category.id),
        entityType: 'CATEGORY',
        schemaVersion: 1,
        ...category,
      },
      { type: 'attributeNotExists', attribute: 'PK' },
      timestamp
    );
    return structuredClone(category);
  }

  async updateCategory(
    input: Pick<AdminCategory, 'id' | 'slug' | 'names'>,
    expectedVersion: number
  ): Promise<AdminCategory> {
    const existing = await this.getCategory(input.id);
    if (!existing) throw new AdminStoreNotFoundError('category');
    const timestamp = this.clock().toISOString();
    const category: AdminCategory = {
      ...structuredClone(input),
      version: expectedVersion + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
    await this.writeTaxonomyItem(
      {
        ...categoryKey(category.id),
        entityType: 'CATEGORY',
        schemaVersion: 1,
        ...category,
      },
      { type: 'equals', attribute: 'version', value: expectedVersion },
      timestamp
    );
    return structuredClone(category);
  }

  async deleteCategory(id: string, expectedVersion: number): Promise<void> {
    await this.deleteTaxonomyItem(categoryKey(id), expectedVersion, 'category');
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

  async getKeyword(id: string): Promise<AdminKeyword | null> {
    const item = await this.dynamodb.get(keywordKey(id), true);
    return item ? keywordFromItem(item) : null;
  }

  async createKeyword(
    input: Pick<AdminKeyword, 'id' | 'language' | 'value'>
  ): Promise<AdminKeyword> {
    const timestamp = this.clock().toISOString();
    const keyword: AdminKeyword = {
      ...structuredClone(input),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.writeTaxonomyItem(
      {
        ...keywordKey(keyword.id),
        entityType: 'KEYWORD',
        schemaVersion: 1,
        ...keyword,
      },
      { type: 'attributeNotExists', attribute: 'PK' },
      timestamp
    );
    return structuredClone(keyword);
  }

  async updateKeyword(
    input: Pick<AdminKeyword, 'id' | 'language' | 'value'>,
    expectedVersion: number
  ): Promise<AdminKeyword> {
    const existing = await this.getKeyword(input.id);
    if (!existing) throw new AdminStoreNotFoundError('keyword');
    const timestamp = this.clock().toISOString();
    const keyword: AdminKeyword = {
      ...structuredClone(input),
      version: expectedVersion + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
    await this.writeTaxonomyItem(
      {
        ...keywordKey(keyword.id),
        entityType: 'KEYWORD',
        schemaVersion: 1,
        ...keyword,
      },
      { type: 'equals', attribute: 'version', value: expectedVersion },
      timestamp
    );
    return structuredClone(keyword);
  }

  async deleteKeyword(id: string, expectedVersion: number): Promise<void> {
    await this.deleteTaxonomyItem(keywordKey(id), expectedVersion, 'keyword');
  }

  async reserveMutation(input: {
    scope: string;
    subject: string;
    key: string;
    requestDigest: string;
  }): Promise<MutationReservation> {
    const key = mutationKey(input.scope, input.subject, input.key);
    const existing = await this.dynamodb.get(key, true);
    if (existing) return this.resolveReservation(existing, input.requestDigest);

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
            createdAt: now.toISOString(),
            expiresAt:
              Math.floor(now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS,
          },
          condition: { type: 'attributeNotExists', attribute: 'PK' },
        },
        revisionAction(now.toISOString()),
      ]);
      return { state: 'reserved', key, requestDigest: input.requestDigest };
    } catch (error) {
      if (!(error instanceof DynamoTransactionCanceledError)) throw error;
      const raced = await this.dynamodb.get(key, true);
      if (!raced) throw new AdminStoreConflictError('idempotency');
      return this.resolveReservation(raced, input.requestDigest);
    }
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

  private async writeTaxonomyItem(
    item: DynamoItem,
    condition: NonNullable<
      Extract<DynamoTransactionAction, { type: 'put' }>['condition']
    >,
    timestamp: string
  ): Promise<void> {
    try {
      await this.dynamodb.transactWrite([
        { type: 'put', label: 'taxonomy:write', item, condition },
        revisionAction(timestamp),
      ]);
    } catch (error) {
      if (error instanceof DynamoTransactionCanceledError) {
        throw new AdminStoreConflictError('version');
      }
      throw error;
    }
  }

  private async deleteTaxonomyItem(
    key: DynamoKey,
    expectedVersion: number,
    resource: 'category' | 'keyword'
  ): Promise<void> {
    const existing = await this.dynamodb.get(key, true);
    if (!existing) throw new AdminStoreNotFoundError(resource);
    try {
      await this.dynamodb.transactWrite([
        {
          type: 'delete',
          label: 'taxonomy:delete',
          key,
          condition: {
            type: 'equals',
            attribute: 'version',
            value: expectedVersion,
          },
        },
        revisionAction(this.clock().toISOString()),
      ]);
    } catch (error) {
      if (error instanceof DynamoTransactionCanceledError) {
        throw new AdminStoreConflictError('version');
      }
      throw error;
    }
  }

  private resolveReservation(
    item: DynamoItem,
    requestDigest: string
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
    throw new AdminStoreConflictError('idempotency');
  }
}
