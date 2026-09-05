import { createHash } from 'node:crypto';

import {
  BACKUP_RESTORE_PROCEDURE,
  DYNAMODB_BACKUP_SCHEMA,
  EXCLUDED_BACKUP_ENTITY_TYPES,
  backupFilename,
  entityCounts,
  isRestorableEntityType,
  validateDynamoDbBackupDocument,
  type BackupEnvironment,
  type BackupValidationIssue,
  type DynamoDbBackupItem,
  type DynamoDbBackupV2,
} from '@/lib/aws/backup-contract';
import type { DynamoItem } from '@/lib/aws/dynamodb/port';

export { DYNAMODB_BACKUP_SCHEMA, backupFilename };
export type { BackupValidationIssue, DynamoDbBackupV2 };

export const MAX_BACKUP_RESPONSE_BYTES = 5_500_000;

export class AdminBackupTooLargeError extends Error {
  readonly code = 'BACKUP_TOO_LARGE';

  constructor(readonly bytes: number) {
    super('The backup exceeds the synchronous download limit');
    this.name = 'AdminBackupTooLargeError';
  }
}

function itemsDigest(items: DynamoDbBackupItem[]): string {
  return createHash('sha256')
    .update(JSON.stringify(items), 'utf8')
    .digest('hex');
}

function restorationItems(items: DynamoItem[]): {
  items: DynamoDbBackupItem[];
  excludedItemCount: number;
} {
  const included: DynamoDbBackupItem[] = [];
  let excludedItemCount = 0;
  for (const item of items) {
    if (
      EXCLUDED_BACKUP_ENTITY_TYPES.includes(
        item.entityType as (typeof EXCLUDED_BACKUP_ENTITY_TYPES)[number]
      )
    ) {
      excludedItemCount += 1;
      continue;
    }
    if (!isRestorableEntityType(item.entityType)) {
      throw new TypeError(
        `Backup contains unsupported entity type: ${String(item.entityType)}`
      );
    }
    included.push(structuredClone(item) as DynamoDbBackupItem);
  }
  included.sort((left, right) =>
    `${left.PK}\u0000${left.SK}`.localeCompare(`${right.PK}\u0000${right.SK}`)
  );
  return { items: included, excludedItemCount };
}

function revision(items: DynamoDbBackupItem[]): number | null {
  const item = items.find(
    candidate => candidate.entityType === 'DATA_REVISION'
  );
  return item && Number.isSafeInteger(item.revision)
    ? (item.revision as number)
    : null;
}

export function createDynamoDbBackup(input: {
  items: DynamoItem[];
  pageCount: number;
  exportedAt: string;
  environment: BackupEnvironment;
}): DynamoDbBackupV2 {
  const prepared = restorationItems(input.items);
  const backup: DynamoDbBackupV2 = {
    schema: DYNAMODB_BACKUP_SCHEMA,
    version: 2,
    exportedAt: input.exportedAt,
    environment: input.environment,
    manifest: {
      itemCount: prepared.items.length,
      excludedItemCount: prepared.excludedItemCount,
      pageCount: input.pageCount,
      revision: revision(prepared.items),
      sha256: itemsDigest(prepared.items),
      entityCounts: entityCounts(prepared.items),
      compatibility: {
        storage: 'dynamodb',
        tableSchemaVersion: 1,
        requiresEmptyTable: true,
        keySchema: ['PK', 'SK'],
        restoreProcedure: BACKUP_RESTORE_PROCEDURE,
      },
    },
    items: prepared.items,
  };
  const issues = validateDynamoDbBackup(backup);
  if (issues.length > 0) {
    throw new TypeError(
      `Generated backup failed schema validation: ${issues[0].code}`
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(backup), 'utf8') + 1024;
  if (bytes > MAX_BACKUP_RESPONSE_BYTES) {
    throw new AdminBackupTooLargeError(bytes);
  }
  return backup;
}

export function validateDynamoDbBackup(
  value: unknown
): BackupValidationIssue[] {
  const items =
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items)
      ? (value.items as DynamoDbBackupItem[])
      : null;
  return validateDynamoDbBackupDocument(
    value,
    items ? itemsDigest(items) : undefined
  );
}
