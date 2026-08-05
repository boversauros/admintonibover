import { MediaUploadConflictError } from '@/lib/domain/media/errors';
import type { ImageRole } from '@/lib/domain/media/contracts';
import {
  PostAggregateTooLargeError,
  PostDataIntegrityError,
  PostNotFoundError,
  PostSlugConflictError,
  PostValidationError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';
import type {
  DeletePostResult,
  ListPostsOptions,
  PostListPage,
  PostRepository,
} from '@/lib/domain/posts/repository';
import type {
  Post,
  PostImage,
  PostLanguage,
  PostListItem,
} from '@/lib/domain/posts/types';
import { slugify } from '@/lib/utils/slugify';

import { estimateDynamoDbItemSize } from './item-size';
import {
  DYNAMODB_TRANSACTION_MAX_BYTES,
  DYNAMODB_TRANSACTION_MAX_ITEMS,
} from './limits';
import {
  postFromItems,
  postIdFromSlugLock,
  postKey,
  postListItemFromItem,
  preparePostItems,
  slugLockKey,
  type PreparedPostItems,
} from './post-items';
import {
  DynamoTransactionCanceledError,
  type DynamoDbPort,
  type DynamoItem,
  type DynamoKey,
  type DynamoTransactionAction,
} from './port';

type Clock = () => Date;

export type DynamoDbPostRepositoryOptions = {
  queryPageSize?: number;
  clock?: Clock;
};

export type ReplaceImageInput = {
  postId: string;
  role: ImageRole;
  image: PostImage;
  confirmedIntentItem: DynamoItem;
};

export type ReplaceImageResult = {
  version: number;
  previousImageKey: string | null;
};

type CursorPayload = DynamoKey & {
  version: 1;
  direction: 'ascending' | 'descending';
};

const SYSTEM_REVISION_KEY: DynamoKey = { PK: 'SYSTEM', SK: 'REVISION' };

function clonePost(post: Post): Post {
  return structuredClone(post);
}

function validationError(
  path: string,
  code: string,
  message: string
): PostValidationError {
  return new PostValidationError([{ path, code, message }]);
}

function transactionBytes(actions: DynamoTransactionAction[]): number {
  return actions.reduce((total, action) => {
    if (action.type === 'put') {
      return total + estimateDynamoDbItemSize(action.item);
    }
    if (action.type === 'delete') {
      return total + estimateDynamoDbItemSize(action.key);
    }
    return (
      total +
      estimateDynamoDbItemSize({
        ...action.key,
        ...action.set,
        [action.attribute]: action.initialValue + action.by,
      })
    );
  }, 0);
}

function assertTransactionWithinLimits(
  actions: DynamoTransactionAction[]
): void {
  if (actions.length > DYNAMODB_TRANSACTION_MAX_ITEMS) {
    throw new PostAggregateTooLargeError(
      `transaction-actions:${actions.length}`
    );
  }
  const bytes = transactionBytes(actions);
  if (bytes > DYNAMODB_TRANSACTION_MAX_BYTES) {
    throw new PostAggregateTooLargeError(`transaction-bytes:${bytes}`);
  }
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

function sameKey(left: DynamoKey | null, right: DynamoKey | null): boolean {
  return left?.PK === right?.PK && left?.SK === right?.SK;
}

function normalizedSearchText(value: string): string {
  return value
    .toLocaleLowerCase('ca')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesListFilters(
  item: PostListItem,
  options: ListPostsOptions
): boolean {
  if (options.published !== undefined && item.published !== options.published) {
    return false;
  }
  if (
    options.categoryId !== undefined &&
    item.category.id !== options.categoryId
  ) {
    return false;
  }
  if (options.title !== undefined && options.title.trim().length > 0) {
    const query = normalizedSearchText(options.title);
    return (
      normalizedSearchText(item.titles.ca).includes(query) ||
      normalizedSearchText(item.titles.en).includes(query)
    );
  }
  return true;
}

function encodeCursor(
  key: DynamoKey,
  direction: CursorPayload['direction']
): string {
  const payload: CursorPayload = { version: 1, direction, ...key };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(
  cursor: string | undefined,
  direction: CursorPayload['direction']
): DynamoKey | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('direction' in parsed) ||
      parsed.direction !== direction ||
      !('PK' in parsed) ||
      parsed.PK !== 'POSTS' ||
      !('SK' in parsed) ||
      typeof parsed.SK !== 'string' ||
      !parsed.SK.startsWith('ORDER#')
    ) {
      throw new Error('invalid cursor');
    }
    return { PK: 'POSTS', SK: parsed.SK };
  } catch {
    throw validationError(
      'cursor',
      'INVALID_CURSOR',
      'The pagination cursor is invalid'
    );
  }
}

function lockKey(
  prepared: PreparedPostItems,
  language: PostLanguage
): DynamoKey | null {
  const lock = prepared.slugLocks[language];
  return lock ? { PK: lock.PK, SK: lock.SK } : null;
}

export class DynamoDbPostRepository implements PostRepository {
  private readonly queryPageSize: number;
  private readonly clock: Clock;

  constructor(
    private readonly dynamodb: DynamoDbPort,
    options: DynamoDbPostRepositoryOptions = {}
  ) {
    this.queryPageSize = options.queryPageSize ?? 25;
    this.clock = options.clock ?? (() => new Date());
    if (!Number.isSafeInteger(this.queryPageSize) || this.queryPageSize < 1) {
      throw new TypeError('queryPageSize must be a positive integer');
    }
  }

  async create(input: Post): Promise<Post> {
    const timestamp = this.clock().toISOString();
    const post: Post = {
      ...clonePost(input),
      version: 1,
      ...(input.migration === null
        ? { createdAt: timestamp, updatedAt: timestamp }
        : {}),
    };
    const prepared = preparePostItems(post);
    const actions: DynamoTransactionAction[] = [
      {
        type: 'put',
        label: 'aggregate:create',
        item: prepared.aggregate,
        condition: { type: 'attributeNotExists', attribute: 'PK' },
      },
      {
        type: 'put',
        label: 'summary:create',
        item: prepared.summary,
        condition: { type: 'attributeNotExists', attribute: 'PK' },
      },
      ...prepared.referenceSegments.map(
        (item): DynamoTransactionAction => ({
          type: 'put',
          label: `segment:create:${item.language}:${item.sequence}`,
          item,
          condition: { type: 'attributeNotExists', attribute: 'PK' },
        })
      ),
      ...(['ca', 'en'] as const).flatMap(language => {
        const item = prepared.slugLocks[language];
        return item
          ? [
              {
                type: 'put' as const,
                label: `slug:${language}:acquire`,
                item,
                condition: {
                  type: 'attributeNotExists' as const,
                  attribute: 'PK',
                },
              },
            ]
          : [];
      }),
      revisionAction(post.updatedAt),
    ];

    assertTransactionWithinLimits(actions);
    try {
      await this.dynamodb.transactWrite(actions);
    } catch (error) {
      this.mapTransactionError(error, actions, post.id, 0);
    }
    return clonePost(post);
  }

  async getById(id: string): Promise<Post | null> {
    const aggregate = await this.dynamodb.get(postKey(id), true);
    if (!aggregate) return null;

    const segments: DynamoItem[] = [];
    if (aggregate.referenceStorage === 'segmented') {
      let exclusiveStartKey: DynamoKey | undefined;
      do {
        const page = await this.dynamodb.query({
          partitionKey: `POST#${id}`,
          sortKeyBeginsWith: 'REFS#',
          consistentRead: true,
          scanIndexForward: true,
          exclusiveStartKey,
          limit: this.queryPageSize,
        });
        segments.push(...page.items);
        exclusiveStartKey = page.lastEvaluatedKey;
      } while (exclusiveStartKey !== undefined);
    }
    return postFromItems(aggregate, segments);
  }

  async getBySlug(language: PostLanguage, slug: string): Promise<Post | null> {
    const normalizedSlug = slugify(slug);
    if (normalizedSlug.length === 0) return null;
    const lock = await this.dynamodb.get(
      slugLockKey(language, normalizedSlug),
      true
    );
    if (!lock) return null;
    return this.getById(postIdFromSlugLock(lock));
  }

  async list(options: ListPostsOptions): Promise<PostListPage> {
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 100
    ) {
      throw validationError(
        'limit',
        'INVALID_PAGE_LIMIT',
        'Page limit must be an integer between 1 and 100'
      );
    }
    const direction = options.direction ?? 'descending';
    let exclusiveStartKey = decodeCursor(options.cursor, direction);
    const items: PostListItem[] = [];

    while (items.length < options.limit) {
      const page = await this.dynamodb.query({
        partitionKey: 'POSTS',
        consistentRead: true,
        scanIndexForward: direction === 'ascending',
        exclusiveStartKey,
        limit: this.queryPageSize,
      });

      for (let index = 0; index < page.items.length; index += 1) {
        const raw = page.items[index];
        const item = postListItemFromItem(raw);
        if (!matchesListFilters(item, options)) continue;
        items.push(item);
        if (items.length === options.limit) {
          const moreInPage = index < page.items.length - 1;
          return {
            items,
            nextCursor:
              moreInPage || page.lastEvaluatedKey
                ? encodeCursor({ PK: raw.PK, SK: raw.SK }, direction)
                : null,
          };
        }
      }

      if (!page.lastEvaluatedKey) break;
      exclusiveStartKey = page.lastEvaluatedKey;
    }

    return { items, nextCursor: null };
  }

  async update(input: Post, expectedVersion: number): Promise<Post> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw validationError(
        'expectedVersion',
        'INVALID_VERSION',
        'Expected version must be an integer of at least 1'
      );
    }
    const timestamp = this.clock().toISOString();
    const preflight: Post = {
      ...clonePost(input),
      version: expectedVersion + 1,
      updatedAt: timestamp,
    };
    preparePostItems(preflight);

    const current = await this.getById(input.id);
    if (!current) throw new PostNotFoundError(input.id);
    if (current.version !== expectedVersion) {
      throw new PostVersionConflictError(input.id, expectedVersion);
    }

    const post: Post = {
      ...preflight,
      createdAt: current.createdAt,
      migration: current.migration,
    };
    const previous = preparePostItems(current);
    const next = preparePostItems(post);
    const actions = this.updateActions(previous, next, post, expectedVersion);
    assertTransactionWithinLimits(actions);

    try {
      await this.dynamodb.transactWrite(actions);
    } catch (error) {
      this.mapTransactionError(error, actions, post.id, expectedVersion);
    }
    return clonePost(post);
  }

  async replaceImage(
    input: ReplaceImageInput,
    expectedVersion: number
  ): Promise<ReplaceImageResult> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw validationError(
        'expectedVersion',
        'INVALID_VERSION',
        'Expected version must be an integer of at least 1'
      );
    }
    const current = await this.getById(input.postId);
    if (!current) throw new PostNotFoundError(input.postId);
    if (current.version !== expectedVersion) {
      throw new PostVersionConflictError(input.postId, expectedVersion);
    }

    const timestamp = this.clock().toISOString();
    const field = input.role === 'main' ? 'mainImage' : 'thumbImage';
    const previousImageKey = current[field]?.key ?? null;
    const post: Post = {
      ...clonePost(current),
      [field]: { ...input.image },
      version: expectedVersion + 1,
      updatedAt: timestamp,
    };
    const previous = preparePostItems(current);
    const next = preparePostItems(post);
    const actions = this.updateActions(previous, next, post, expectedVersion);
    actions.push({
      type: 'put',
      label: 'media-intent:confirm',
      item: input.confirmedIntentItem,
      condition: { type: 'equals', attribute: 'status', value: 'pending' },
    });
    assertTransactionWithinLimits(actions);

    try {
      await this.dynamodb.transactWrite(actions);
    } catch (error) {
      this.mapTransactionError(error, actions, input.postId, expectedVersion);
    }
    return { version: post.version, previousImageKey };
  }

  async delete(id: string, expectedVersion: number): Promise<DeletePostResult> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw validationError(
        'expectedVersion',
        'INVALID_VERSION',
        'Expected version must be an integer of at least 1'
      );
    }
    const current = await this.getById(id);
    if (!current) throw new PostNotFoundError(id);
    if (current.version !== expectedVersion) {
      throw new PostVersionConflictError(id, expectedVersion);
    }
    const prepared = preparePostItems(current);
    const actions: DynamoTransactionAction[] = [
      {
        type: 'delete',
        label: 'aggregate:delete',
        key: postKey(id),
        condition: {
          type: 'equals',
          attribute: 'version',
          value: expectedVersion,
        },
      },
      {
        type: 'delete',
        label: 'summary:delete',
        key: { PK: prepared.summary.PK, SK: prepared.summary.SK },
      },
      ...prepared.referenceSegments.map(
        (segment): DynamoTransactionAction => ({
          type: 'delete',
          label: `segment:delete:${segment.language}:${segment.sequence}`,
          key: { PK: segment.PK, SK: segment.SK },
        })
      ),
      ...(['ca', 'en'] as const).flatMap(language => {
        const key = lockKey(prepared, language);
        return key
          ? [
              {
                type: 'delete' as const,
                label: `slug:${language}:release`,
                key,
                condition: {
                  type: 'equals' as const,
                  attribute: 'postId',
                  value: id,
                },
              },
            ]
          : [];
      }),
      revisionAction(this.clock().toISOString()),
    ];
    assertTransactionWithinLimits(actions);
    try {
      await this.dynamodb.transactWrite(actions);
    } catch (error) {
      this.mapTransactionError(error, actions, id, expectedVersion);
    }

    return {
      postId: id,
      imageKeys: [current.mainImage?.key, current.thumbImage?.key].filter(
        (key): key is string => key !== undefined
      ),
    };
  }

  private updateActions(
    previous: PreparedPostItems,
    next: PreparedPostItems,
    post: Post,
    expectedVersion: number
  ): DynamoTransactionAction[] {
    const actions: DynamoTransactionAction[] = [
      {
        type: 'put',
        label: 'aggregate:update',
        item: next.aggregate,
        condition: {
          type: 'equals',
          attribute: 'version',
          value: expectedVersion,
        },
      },
    ];

    const oldSummaryKey = {
      PK: previous.summary.PK,
      SK: previous.summary.SK,
    };
    const newSummaryKey = { PK: next.summary.PK, SK: next.summary.SK };
    if (!sameKey(oldSummaryKey, newSummaryKey)) {
      actions.push({
        type: 'delete',
        label: 'summary:delete-old',
        key: oldSummaryKey,
      });
    }
    actions.push({ type: 'put', label: 'summary:put', item: next.summary });

    const nextSegmentKeys = new Set(
      next.referenceSegments.map(segment => `${segment.PK}\u0000${segment.SK}`)
    );
    for (const segment of next.referenceSegments) {
      actions.push({
        type: 'put',
        label: `segment:put:${segment.language}:${segment.sequence}`,
        item: segment,
      });
    }
    for (const segment of previous.referenceSegments) {
      if (!nextSegmentKeys.has(`${segment.PK}\u0000${segment.SK}`)) {
        actions.push({
          type: 'delete',
          label: `segment:delete-old:${segment.language}:${segment.sequence}`,
          key: { PK: segment.PK, SK: segment.SK },
        });
      }
    }

    for (const language of ['ca', 'en'] as const) {
      const oldKey = lockKey(previous, language);
      const newKey = lockKey(next, language);
      if (sameKey(oldKey, newKey)) continue;
      const newLock = next.slugLocks[language];
      if (newLock) {
        actions.push({
          type: 'put',
          label: `slug:${language}:acquire`,
          item: newLock,
          condition: {
            type: 'attributeNotExistsOrEquals',
            attribute: 'postId',
            value: post.id,
          },
        });
      }
      if (oldKey) {
        actions.push({
          type: 'delete',
          label: `slug:${language}:release`,
          key: oldKey,
          condition: {
            type: 'equals',
            attribute: 'postId',
            value: post.id,
          },
        });
      }
    }
    actions.push(revisionAction(post.updatedAt));
    return actions;
  }

  private mapTransactionError(
    error: unknown,
    actions: DynamoTransactionAction[],
    postId: string,
    expectedVersion: number
  ): never {
    if (!(error instanceof DynamoTransactionCanceledError)) throw error;
    const failedIndexes = error.reasons
      .map((reason, index) =>
        reason === 'ConditionalCheckFailed' ? index : -1
      )
      .filter(index => index >= 0);
    for (const index of failedIndexes) {
      const label = actions[index]?.label ?? '';
      const slugMatch = /^slug:(ca|en):acquire$/.exec(label);
      if (slugMatch)
        throw new PostSlugConflictError(slugMatch[1] as PostLanguage);
      if (label.startsWith('aggregate:')) {
        throw new PostVersionConflictError(postId, expectedVersion);
      }
      if (label === 'media-intent:confirm') {
        const uploadId = String(
          actions[index]?.type === 'put'
            ? (actions[index].item.uploadId ?? 'unknown')
            : 'unknown'
        );
        throw new MediaUploadConflictError(uploadId);
      }
      if (label.includes(':release')) {
        throw new PostDataIntegrityError('slug-lock-owner-mismatch');
      }
    }
    throw new PostVersionConflictError(postId, expectedVersion);
  }
}
