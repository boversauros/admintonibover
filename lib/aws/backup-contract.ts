export const DYNAMODB_BACKUP_SCHEMA =
  'https://github.com/boversauros/admintonibover/blob/main/docs/schemas/dynamodb-backup-v2.schema.json' as const;

export const BACKUP_ENVIRONMENTS = ['dev', 'prod'] as const;
export type BackupEnvironment = (typeof BACKUP_ENVIRONMENTS)[number];

export const RESTORABLE_ENTITY_TYPES = [
  'DATA_REVISION',
  'POST',
  'POST_SUMMARY',
  'REFERENCE_SEGMENT',
  'SLUG_LOCK',
  'CATEGORY',
  'KEYWORD',
] as const;
export type RestorableEntityType = (typeof RESTORABLE_ENTITY_TYPES)[number];

export const EXCLUDED_BACKUP_ENTITY_TYPES = [
  'IDEMPOTENCY',
  'MEDIA_UPLOAD',
] as const;

export const BACKUP_RESTORE_PROCEDURE =
  'https://github.com/boversauros/admintonibover/blob/main/docs/runbooks/aws-admin-backup-and-utilities.md' as const;

export type BackupJsonValue =
  | null
  | string
  | number
  | boolean
  | BackupJsonValue[]
  | { [key: string]: BackupJsonValue };

export type DynamoDbBackupItem = {
  PK: string;
  SK: string;
  entityType: RestorableEntityType;
} & Record<string, BackupJsonValue>;

export type DynamoDbBackupV2 = {
  schema: typeof DYNAMODB_BACKUP_SCHEMA;
  version: 2;
  exportedAt: string;
  environment: BackupEnvironment;
  manifest: {
    itemCount: number;
    excludedItemCount: number;
    pageCount: number;
    revision: number | null;
    sha256: string;
    entityCounts: Record<RestorableEntityType, number>;
    compatibility: {
      storage: 'dynamodb';
      tableSchemaVersion: 1;
      requiresEmptyTable: true;
      keySchema: readonly ['PK', 'SK'];
      restoreProcedure: typeof BACKUP_RESTORE_PROCEDURE;
    };
  };
  items: DynamoDbBackupItem[];
};

export type BackupValidationIssue = {
  path: string;
  code: string;
  message: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SIGNED_URL_PATTERN =
  /[?&](?:X-Amz-(?:Algorithm|Credential|Date|Expires|SignedHeaders|Signature|Security-Token)|AWSAccessKeyId)=/i;
const FORBIDDEN_FIELD_NAMES = new Set([
  'authorization',
  'credentials',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'accesskeyid',
  'secretaccesskey',
  'awssessiontoken',
  'password',
  'secret',
  'clientsecret',
  'presignedurl',
  'signedurl',
  'uploadurl',
  'downloadurl',
  'accountid',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is BackupJsonValue {
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

function normalizedFieldName(value: string): string {
  return value.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
}

function sensitiveValuePath(value: unknown, path: string): string | null {
  if (typeof value === 'string') {
    return SIGNED_URL_PATTERN.test(value) ? path : null;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = sensitiveValuePath(item, `${path}.${index}`);
      if (result) return result;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (FORBIDDEN_FIELD_NAMES.has(normalizedFieldName(key))) return itemPath;
    const result = sensitiveValuePath(item, itemPath);
    if (result) return result;
  }
  return null;
}

function isNormalizedUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function emptyEntityCounts(): Record<RestorableEntityType, number> {
  return Object.fromEntries(
    RESTORABLE_ENTITY_TYPES.map(entityType => [entityType, 0])
  ) as Record<RestorableEntityType, number>;
}

export function entityCounts(
  items: Array<{ entityType: RestorableEntityType }>
): Record<RestorableEntityType, number> {
  const counts = emptyEntityCounts();
  for (const item of items) counts[item.entityType] += 1;
  return counts;
}

export function isRestorableEntityType(
  value: unknown
): value is RestorableEntityType {
  return RESTORABLE_ENTITY_TYPES.includes(value as RestorableEntityType);
}

export function backupFilename(
  environment: BackupEnvironment,
  exportedAt: string
): string {
  const stamp = exportedAt.slice(0, 19).replaceAll(':', '-');
  return `admintonibover-aws-backup-${environment}-${stamp}Z.json`;
}

export function validateDynamoDbBackupDocument(
  value: unknown,
  computedSha256?: string
): BackupValidationIssue[] {
  const issues: BackupValidationIssue[] = [];
  const issue = (path: string, code: string, message: string) => {
    issues.push({ path, code, message });
  };
  if (!isRecord(value)) {
    issue('$', 'INVALID_DOCUMENT', 'Backup must be a JSON object');
    return issues;
  }
  if (
    !hasExactKeys(value, [
      'schema',
      'version',
      'exportedAt',
      'environment',
      'manifest',
      'items',
    ])
  ) {
    issue('$', 'UNEXPECTED_FIELDS', 'Backup has unexpected top-level fields');
  }
  if (value.schema !== DYNAMODB_BACKUP_SCHEMA) {
    issue('schema', 'INVALID_SCHEMA', 'Backup schema is not supported');
  }
  if (value.version !== 2) {
    issue('version', 'INVALID_VERSION', 'Backup version must be 2');
  }
  if (!isNormalizedUtcTimestamp(value.exportedAt)) {
    issue(
      'exportedAt',
      'INVALID_TIMESTAMP',
      'Export timestamp must be normalized UTC ISO-8601'
    );
  }
  if (!BACKUP_ENVIRONMENTS.includes(value.environment as BackupEnvironment)) {
    issue('environment', 'INVALID_ENVIRONMENT', 'Environment is not supported');
  }
  if (!Array.isArray(value.items)) {
    issue('items', 'INVALID_ITEMS', 'Backup items must be an array');
    return issues;
  }

  const seenKeys = new Set<string>();
  const computedCounts = emptyEntityCounts();
  let storedRevision: number | null = null;
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
    if (!isRestorableEntityType(candidate.entityType)) {
      issue(
        `items.${index}.entityType`,
        'INVALID_ENTITY_TYPE',
        'Item is not part of the restoration contract'
      );
      return;
    }
    computedCounts[candidate.entityType] += 1;
    if (
      candidate.entityType === 'DATA_REVISION' &&
      Number.isSafeInteger(candidate.revision)
    ) {
      storedRevision = candidate.revision as number;
    }
    const key = `${candidate.PK}\u0000${candidate.SK}`;
    if (seenKeys.has(key)) {
      issue(`items.${index}`, 'DUPLICATE_KEY', 'Item keys must be unique');
    }
    seenKeys.add(key);
    const sensitivePath = sensitiveValuePath(candidate, `items.${index}`);
    if (sensitivePath) {
      issue(
        sensitivePath,
        'SENSITIVE_VALUE',
        'Backup contains a credential, secret, account identifier, or signed URL'
      );
    }
  });

  if (!isRecord(value.manifest)) {
    issue('manifest', 'INVALID_MANIFEST', 'Backup manifest is required');
    return issues;
  }
  const manifest = value.manifest;
  if (
    !hasExactKeys(manifest, [
      'itemCount',
      'excludedItemCount',
      'pageCount',
      'revision',
      'sha256',
      'entityCounts',
      'compatibility',
    ])
  ) {
    issue(
      'manifest',
      'UNEXPECTED_FIELDS',
      'Backup manifest has unexpected fields'
    );
  }
  if (manifest.itemCount !== value.items.length) {
    issue(
      'manifest.itemCount',
      'COUNT_MISMATCH',
      'Manifest item count does not match the items array'
    );
  }
  if (
    !Number.isSafeInteger(manifest.excludedItemCount) ||
    (manifest.excludedItemCount as number) < 0
  ) {
    issue(
      'manifest.excludedItemCount',
      'INVALID_EXCLUDED_COUNT',
      'Excluded item count must be a non-negative integer'
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
  } else if (manifest.revision !== storedRevision) {
    issue(
      'manifest.revision',
      'REVISION_MISMATCH',
      'Manifest revision does not match the restoration items'
    );
  }
  if (
    typeof manifest.sha256 !== 'string' ||
    !SHA256_PATTERN.test(manifest.sha256)
  ) {
    issue(
      'manifest.sha256',
      'INVALID_DIGEST',
      'Manifest digest must be a lowercase SHA-256 value'
    );
  } else if (computedSha256 && manifest.sha256 !== computedSha256) {
    issue(
      'manifest.sha256',
      'DIGEST_MISMATCH',
      'Manifest digest does not match the items array'
    );
  }

  if (!isRecord(manifest.entityCounts)) {
    issue(
      'manifest.entityCounts',
      'INVALID_ENTITY_COUNTS',
      'Entity counts are required'
    );
  } else {
    if (!hasExactKeys(manifest.entityCounts, [...RESTORABLE_ENTITY_TYPES])) {
      issue(
        'manifest.entityCounts',
        'INVALID_ENTITY_COUNTS',
        'Entity counts do not match the restoration contract'
      );
    }
    for (const entityType of RESTORABLE_ENTITY_TYPES) {
      if (manifest.entityCounts[entityType] !== computedCounts[entityType]) {
        issue(
          `manifest.entityCounts.${entityType}`,
          'COUNT_MISMATCH',
          'Entity count does not match the items array'
        );
      }
    }
  }

  if (!isRecord(manifest.compatibility)) {
    issue(
      'manifest.compatibility',
      'INVALID_COMPATIBILITY',
      'Restoration compatibility metadata is required'
    );
  } else {
    const compatibility = manifest.compatibility;
    if (
      !hasExactKeys(compatibility, [
        'storage',
        'tableSchemaVersion',
        'requiresEmptyTable',
        'keySchema',
        'restoreProcedure',
      ]) ||
      compatibility.storage !== 'dynamodb' ||
      compatibility.tableSchemaVersion !== 1 ||
      compatibility.requiresEmptyTable !== true ||
      !Array.isArray(compatibility.keySchema) ||
      compatibility.keySchema.length !== 2 ||
      compatibility.keySchema[0] !== 'PK' ||
      compatibility.keySchema[1] !== 'SK' ||
      compatibility.restoreProcedure !== BACKUP_RESTORE_PROCEDURE
    ) {
      issue(
        'manifest.compatibility',
        'INVALID_COMPATIBILITY',
        'Restoration compatibility metadata is not supported'
      );
    }
  }
  return issues;
}

export function isDynamoDbBackupV2(value: unknown): value is DynamoDbBackupV2 {
  return validateDynamoDbBackupDocument(value).length === 0;
}
