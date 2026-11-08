import { integerValue, recordValue, stringValue } from '@/lib/contract/values';

import type { PostLanguage } from '@/lib/domain/posts/types';
import type {
  DynamoDbPort,
  DynamoItem,
  DynamoKey,
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

export class AdminStoreConflictError extends Error {
  readonly code = 'ADMIN_STORE_CONFLICT';

  constructor() {
    super('The requested change conflicts with current state');
    this.name = 'AdminStoreConflictError';
  }
}

const CATEGORY_PARTITION = 'TAXONOMY#CATEGORIES';
const KEYWORD_PARTITION = 'TAXONOMY#KEYWORDS';
const SYSTEM_REVISION_KEY: DynamoKey = { PK: 'SYSTEM', SK: 'REVISION' };

function categoryFromItem(item: DynamoItem): AdminCategory {
  if (item.entityType !== 'CATEGORY' || item.schemaVersion !== 1) {
    throw new TypeError('DynamoDB item is not a category');
  }
  const names = recordValue(item.names, 'names');
  if (typeof names.ca !== 'string' || typeof names.en !== 'string') {
    throw new TypeError('Stored category has invalid names');
  }
  return {
    id: stringValue(item.id, 'id'),
    slug: stringValue(item.slug, 'slug'),
    names: {
      ca: names.ca,
      en: names.en,
    },
    version: integerValue(item.version, 'version'),
    createdAt: stringValue(item.createdAt, 'createdAt'),
    updatedAt: stringValue(item.updatedAt, 'updatedAt'),
  };
}

function keywordFromItem(item: DynamoItem): AdminKeyword {
  if (item.entityType !== 'KEYWORD' || item.schemaVersion !== 1) {
    throw new TypeError('DynamoDB item is not a keyword');
  }
  const language = stringValue(item.language, 'language');
  if (language !== 'ca' && language !== 'en') {
    throw new TypeError('Stored keyword has invalid language');
  }
  return {
    id: stringValue(item.id, 'id'),
    language,
    value: stringValue(item.value, 'value'),
    version: integerValue(item.version, 'version'),
    createdAt: stringValue(item.createdAt, 'createdAt'),
    updatedAt: stringValue(item.updatedAt, 'updatedAt'),
  };
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
      throw new AdminStoreConflictError();
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
}
