import { createHash } from 'node:crypto';

import type { DynamoItem } from '@/lib/aws/dynamodb/port';

export const DYNAMODB_BACKUP_SCHEMA =
  'https://github.com/boversauros/admintonibover/blob/main/docs/schemas/dynamodb-backup-v1.schema.json' as const;
export const MAX_BACKUP_RESPONSE_BYTES = 5_500_000;

export type DynamoDbBackupV1 = {
  schema: typeof DYNAMODB_BACKUP_SCHEMA;
  version: 1;
  exportedAt: string;
  manifest: {
    itemCount: number;
    pageCount: number;
    revision: number | null;
    sha256: string;
    keySchema: readonly ['PK', 'SK'];
  };
  items: DynamoItem[];
};

export class AdminBackupTooLargeError extends Error {
  readonly code = 'BACKUP_TOO_LARGE';

  constructor(readonly bytes: number) {
    super('The backup exceeds the synchronous download limit');
    this.name = 'AdminBackupTooLargeError';
  }
}

export type BackupValidationIssue = {
  path: string;
  code: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

function isNormalizedUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function revision(items: DynamoItem[]): number | null {
  const item = items.find(
    candidate => candidate.PK === 'SYSTEM' && candidate.SK === 'REVISION'
  );
  return item && Number.isSafeInteger(item.revision)
    ? (item.revision as number)
    : null;
}

function itemsDigest(items: DynamoItem[]): string {
  return createHash('sha256')
    .update(JSON.stringify(items), 'utf8')
    .digest('hex');
}

export function createDynamoDbBackup(input: {
  items: DynamoItem[];
  pageCount: number;
  exportedAt: string;
}): DynamoDbBackupV1 {
  const items = structuredClone(input.items).sort((left, right) =>
    `${left.PK}\u0000${left.SK}`.localeCompare(`${right.PK}\u0000${right.SK}`)
  );
  const backup: DynamoDbBackupV1 = {
    schema: DYNAMODB_BACKUP_SCHEMA,
    version: 1,
    exportedAt: input.exportedAt,
    manifest: {
      itemCount: items.length,
      pageCount: input.pageCount,
      revision: revision(items),
      sha256: itemsDigest(items),
      keySchema: ['PK', 'SK'],
    },
    items,
  };
  const issues = validateDynamoDbBackup(backup);
  if (issues.length > 0) {
    throw new TypeError(
      `Generated backup failed schema validation: ${issues[0].code}`
    );
  }
  const serialized = JSON.stringify(backup);
  const bytes = Buffer.byteLength(JSON.stringify(serialized), 'utf8') + 1024;
  if (bytes > MAX_BACKUP_RESPONSE_BYTES) {
    throw new AdminBackupTooLargeError(bytes);
  }
  return backup;
}

export function validateDynamoDbBackup(
  value: unknown
): BackupValidationIssue[] {
  const issues: BackupValidationIssue[] = [];
  const issue = (path: string, code: string, message: string) => {
    issues.push({ path, code, message });
  };
  if (!isRecord(value)) {
    issue('$', 'INVALID_DOCUMENT', 'Backup must be a JSON object');
    return issues;
  }
  if (value.schema !== DYNAMODB_BACKUP_SCHEMA) {
    issue('schema', 'INVALID_SCHEMA', 'Backup schema is not supported');
  }
  if (value.version !== 1) {
    issue('version', 'INVALID_VERSION', 'Backup version must be 1');
  }
  if (!isNormalizedUtcTimestamp(value.exportedAt)) {
    issue(
      'exportedAt',
      'INVALID_TIMESTAMP',
      'Export timestamp must be normalized UTC ISO-8601'
    );
  }
  if (!Array.isArray(value.items)) {
    issue('items', 'INVALID_ITEMS', 'Backup items must be an array');
    return issues;
  }
  const seenKeys = new Set<string>();
  value.items.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issue(`items.${index}`, 'INVALID_ITEM', 'Item must be an object');
      return;
    }
    if (!isJsonValue(candidate)) {
      issue(
        `items.${index}`,
        'UNSUPPORTED_VALUE',
        'Item contains a value that cannot be represented in JSON'
      );
      return;
    }
    if (
      typeof candidate.PK !== 'string' ||
      candidate.PK.length === 0 ||
      typeof candidate.SK !== 'string' ||
      candidate.SK.length === 0
    ) {
      issue(
        `items.${index}`,
        'INVALID_KEY',
        'Every item must have non-empty string PK and SK values'
      );
      return;
    }
    const key = `${candidate.PK}\u0000${candidate.SK}`;
    if (seenKeys.has(key)) {
      issue(`items.${index}`, 'DUPLICATE_KEY', 'Item keys must be unique');
    }
    seenKeys.add(key);
  });
  if (!isRecord(value.manifest)) {
    issue('manifest', 'INVALID_MANIFEST', 'Backup manifest is required');
    return issues;
  }
  const manifest = value.manifest;
  if (manifest.itemCount !== value.items.length) {
    issue(
      'manifest.itemCount',
      'COUNT_MISMATCH',
      'Manifest item count does not match the items array'
    );
  }
  if (
    !Number.isSafeInteger(manifest.pageCount) ||
    (manifest.pageCount as number) < 1
  ) {
    issue(
      'manifest.pageCount',
      'INVALID_PAGE_COUNT',
      'Manifest page count must be a positive integer'
    );
  }
  if (
    manifest.revision !== null &&
    (!Number.isSafeInteger(manifest.revision) ||
      (manifest.revision as number) < 0)
  ) {
    issue(
      'manifest.revision',
      'INVALID_REVISION',
      'Manifest revision must be null or a non-negative integer'
    );
  }
  if (manifest.sha256 !== itemsDigest(value.items as DynamoItem[])) {
    issue(
      'manifest.sha256',
      'DIGEST_MISMATCH',
      'Manifest digest does not match the items array'
    );
  }
  if (
    !Array.isArray(manifest.keySchema) ||
    manifest.keySchema.length !== 2 ||
    manifest.keySchema[0] !== 'PK' ||
    manifest.keySchema[1] !== 'SK'
  ) {
    issue(
      'manifest.keySchema',
      'INVALID_KEY_SCHEMA',
      'Manifest key schema must be [PK, SK]'
    );
  }
  return issues;
}
