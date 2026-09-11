import type { PostMigrationMetadata } from '../../domain/posts/types';
import { postFromItems, preparePostItems } from '../../aws/dynamodb/post-items';
import { estimateDynamoDbItemSize } from '../../aws/dynamodb/item-size';
import {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  DYNAMODB_TRANSACTION_MAX_BYTES,
  DYNAMODB_TRANSACTION_MAX_ITEMS,
} from '../../aws/dynamodb/limits';
import type { DynamoItem } from '../../aws/dynamodb/port';
import type { ValidatedBackupProjection } from '../backup-validator';
import { deterministicHash, itemKey, postContentHash } from './hash';
import {
  MIGRATION_ENTITY_TYPES,
  type MigrationEntityType,
  type MigrationPlan,
  type MigrationTarget,
  type PlannedItemGroup,
  type PlannedPost,
  type TransformedCounts,
} from './types';

const TAXONOMY_TRANSACTION_ITEM_LIMIT = 90;
const TRANSACTION_METADATA_RESERVE_BYTES = 64 * 1024;

export class MigrationPlanError extends Error {
  readonly code = 'MIGRATION_PLAN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationPlanError';
  }
}

function compareIds(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

export function deriveMigrationRunId(
  sourceSha256: string,
  target: MigrationTarget | null
): string {
  const targetIdentity = target
    ? `${target.environment}\u0000${target.accountId}\u0000${target.region}\u0000${target.tableName}`
    : 'offline-dry-run';
  return `migration-${deterministicHash(
    `${sourceSha256}\u0000${targetIdentity}`
  ).slice(0, 24)}`;
}

function migrationItem<T extends DynamoItem>(
  item: T,
  migration: PostMigrationMetadata
): T {
  return {
    ...item,
    migration: { ...migration },
  };
}

function categoryItems(
  projection: ValidatedBackupProjection,
  migration: PostMigrationMetadata
): DynamoItem[] {
  const { backup } = projection;
  const languageById = new Map(
    backup.languages.map(language => [language.id, language])
  );
  const translationsByCategory = new Map<
    string,
    typeof backup.categoryTranslations
  >();
  for (const translation of backup.categoryTranslations) {
    const translations =
      translationsByCategory.get(translation.categoryId) ?? [];
    translations.push(translation);
    translationsByCategory.set(translation.categoryId, translations);
  }

  return [...backup.categories]
    .sort((left, right) => compareIds(left.id, right.id))
    .map(category => {
      const translations = translationsByCategory.get(category.id) ?? [];
      const byLanguage = new Map(
        translations.map(translation => [
          languageById.get(translation.languageId)?.code,
          translation,
        ])
      );
      const ca = byLanguage.get('ca');
      const en = byLanguage.get('en');
      if (!ca || !en) {
        throw new MigrationPlanError(
          `Category ${category.id} is missing a validated translation`
        );
      }
      return migrationItem(
        {
          PK: 'TAXONOMY#CATEGORIES',
          SK: `CATEGORY#${category.id}`,
          entityType: 'CATEGORY',
          schemaVersion: 1,
          id: category.id,
          slug: category.slug,
          names: { ca: ca.name, en: en.name },
          legacyTranslationIds: { ca: ca.id, en: en.id },
          legacyLanguageIds: {
            ca: ca.languageId,
            en: en.languageId,
          },
          version: 1,
          createdAt: backup.manifest.exportedAt,
          updatedAt: backup.manifest.exportedAt,
        },
        migration
      );
    });
}

function keywordItems(
  projection: ValidatedBackupProjection,
  migration: PostMigrationMetadata
): DynamoItem[] {
  const { backup } = projection;
  const languageById = new Map(
    backup.languages.map(language => [language.id, language])
  );
  return [...backup.keywords]
    .sort((left, right) => compareIds(left.id, right.id))
    .map(keyword => {
      const language = languageById.get(keyword.languageId);
      if (!language) {
        throw new MigrationPlanError(
          `Keyword ${keyword.id} has no validated language`
        );
      }
      return migrationItem(
        {
          PK: 'TAXONOMY#KEYWORDS',
          SK: `KEYWORD#${keyword.id}`,
          entityType: 'KEYWORD',
          schemaVersion: 1,
          id: keyword.id,
          language: language.code,
          value: keyword.keyword,
          legacyLanguageId: language.id,
          version: 1,
          createdAt: backup.manifest.exportedAt,
          updatedAt: backup.manifest.exportedAt,
        },
        migration
      );
    });
}

function chunkItems(items: DynamoItem[], size: number): DynamoItem[][] {
  const chunks: DynamoItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function transactionBytes(items: DynamoItem[]): number {
  return items.reduce(
    (total, item) => total + estimateDynamoDbItemSize(item),
    0
  );
}

function assertGroupWithinTransactionLimits(group: PlannedItemGroup): void {
  const actionCount = group.items.length + 1;
  if (actionCount > DYNAMODB_TRANSACTION_MAX_ITEMS) {
    throw new MigrationPlanError(
      `${group.label} requires ${actionCount} DynamoDB actions`
    );
  }
  for (const item of group.items) {
    if (estimateDynamoDbItemSize(item) >= DYNAMODB_ITEM_SIZE_GUARD_BYTES) {
      throw new MigrationPlanError(
        `${group.label} contains an item at or above the 350 KiB guard`
      );
    }
  }
  const bytes =
    transactionBytes(group.items) + TRANSACTION_METADATA_RESERVE_BYTES;
  if (bytes > DYNAMODB_TRANSACTION_MAX_BYTES) {
    throw new MigrationPlanError(
      `${group.label} exceeds DynamoDB's transaction size limit`
    );
  }
}

function postPlans(
  projection: ValidatedBackupProjection,
  migration: PostMigrationMetadata
): PlannedPost[] {
  return projection.projectedPosts.map(projected => {
    const post = postFromItems(
      projected.aggregate,
      projected.referenceSegments
    );
    post.migration = { ...migration };
    const prepared = preparePostItems(post);
    const items = [
      prepared.aggregate,
      prepared.summary,
      ...prepared.referenceSegments,
      ...Object.values(prepared.slugLocks).filter(
        (item): item is NonNullable<typeof item> => item !== null
      ),
    ].map(item => migrationItem(item, migration));
    return {
      postId: post.id,
      contentHash: postContentHash(items),
      items,
    };
  });
}

function transformedCounts(items: DynamoItem[]): TransformedCounts {
  const counts = Object.fromEntries(
    MIGRATION_ENTITY_TYPES.map(entityType => [entityType, 0])
  ) as TransformedCounts;
  for (const item of items) {
    const entityType = item.entityType as MigrationEntityType;
    if (MIGRATION_ENTITY_TYPES.includes(entityType)) counts[entityType] += 1;
  }
  return counts;
}

function assertUniqueKeys(items: DynamoItem[]): void {
  const keys = new Set<string>();
  for (const item of items) {
    const key = itemKey(item);
    if (keys.has(key)) {
      throw new MigrationPlanError(
        'The migration plan contains a duplicate key'
      );
    }
    keys.add(key);
  }
}

export function createMigrationPlan(
  projection: ValidatedBackupProjection,
  target: MigrationTarget | null = null
): MigrationPlan {
  if (!projection.report.valid) {
    throw new MigrationPlanError(
      `Backup validation reported ${projection.report.summary.errorCount} error(s)`
    );
  }
  if (
    !projection.report.sourceIntegrity.hashUnchanged ||
    !projection.report.sourceIntegrity.modificationTimeUnchanged
  ) {
    throw new MigrationPlanError('Backup source integrity was not preserved');
  }

  const runId = deriveMigrationRunId(projection.report.source.sha256, target);
  const migration: PostMigrationMetadata = {
    source: 'legacy-backup',
    runId,
  };
  const taxonomyItems = [
    ...categoryItems(projection, migration),
    ...keywordItems(projection, migration),
  ];
  const taxonomyGroups = chunkItems(
    taxonomyItems,
    TAXONOMY_TRANSACTION_ITEM_LIMIT
  ).map((items, index) => ({ label: `taxonomy-${index + 1}`, items }));
  const posts = postPlans(projection, migration);
  const postGroups = posts.map(post => ({
    label: `post-${post.postId}`,
    items: post.items,
  }));
  const groups = [...taxonomyGroups, ...postGroups];
  const items = groups.flatMap(group => group.items);
  assertUniqueKeys(items);
  groups.forEach(assertGroupWithinTransactionLimits);

  return {
    runId,
    migration,
    target,
    source: { ...projection.report.source },
    sourceCounts: { ...projection.report.counts },
    transformedCounts: transformedCounts(items),
    warnings: projection.report.issues
      .filter(issue => issue.severity === 'warning')
      .map(({ code, recordId, table }) => ({
        code,
        ...(recordId === undefined ? {} : { recordId }),
        ...(table === undefined ? {} : { table }),
      })),
    validation: structuredClone(projection.report),
    taxonomyGroups,
    posts,
    groups,
    items,
    legacy: {
      languages: structuredClone(projection.backup.languages),
      postOwners: projection.backup.posts.map(post => ({
        postId: post.id,
        userId: post.userId,
      })),
      postImages: projection.backup.posts.map(post => ({
        postId: post.id,
        mainImageId: post.imageId,
        thumbnailImageId: post.thumbnailId,
      })),
      images: structuredClone(projection.backup.images),
    },
  };
}
