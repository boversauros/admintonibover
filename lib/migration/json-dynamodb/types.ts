import type { PostMigrationMetadata } from '../../domain/posts/types';
import type { DynamoItem } from '../../aws/dynamodb/port';
import type {
  BackupTableName,
  ParsedBackup,
  SourceFileMetadata,
  ValidationIssue,
  ValidationReport,
} from '../backup-validator/types';

export const MIGRATION_TOOL_VERSION = 1;
export const MIGRATION_SCHEMA_VERSION = 1;

export type MigrationEnvironment = 'dev' | 'prod';

export type MigrationTarget = {
  environment: MigrationEnvironment;
  accountId: string;
  region: string;
  tableName: string;
};

export type PlannedItemGroup = {
  label: string;
  items: DynamoItem[];
};

export type PlannedPost = {
  postId: string;
  contentHash: string;
  items: DynamoItem[];
};

export const MIGRATION_ENTITY_TYPES = [
  'POST',
  'POST_SUMMARY',
  'REFERENCE_SEGMENT',
  'SLUG_LOCK',
  'CATEGORY',
  'KEYWORD',
] as const;

export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPES)[number];

export type TransformedCounts = Record<MigrationEntityType, number>;

export type SafeValidationWarning = Pick<
  ValidationIssue,
  'code' | 'recordId' | 'table'
>;

export type LegacyMigrationMetadata = {
  languages: ParsedBackup['languages'];
  postOwners: Array<{ postId: string; userId: string }>;
  postImages: Array<{
    postId: string;
    mainImageId: string | null;
    thumbnailImageId: string | null;
  }>;
  images: ParsedBackup['images'];
};

export type MigrationPlan = {
  runId: string;
  migration: PostMigrationMetadata;
  target: MigrationTarget | null;
  source: SourceFileMetadata;
  sourceCounts: Record<BackupTableName, number>;
  transformedCounts: TransformedCounts;
  warnings: SafeValidationWarning[];
  validation: ValidationReport;
  taxonomyGroups: PlannedItemGroup[];
  posts: PlannedPost[];
  groups: PlannedItemGroup[];
  items: DynamoItem[];
  legacy: LegacyMigrationMetadata;
};

export type RecordFingerprint = {
  entityType: string;
  keyFingerprint: string;
};

export type PostHashComparison = {
  postId: string;
  sourceHash: string;
  targetHash: string | null;
  matches: boolean;
};

export type MigrationVerificationReport = {
  valid: boolean;
  sourceCounts: Record<BackupTableName, number>;
  expectedCounts: TransformedCounts;
  targetCounts: TransformedCounts;
  sourcePostIds: string[];
  targetPostIds: string[];
  sourceCategoryIds: string[];
  targetCategoryIds: string[];
  sourceKeywordIds: string[];
  targetKeywordIds: string[];
  missingRecords: RecordFingerprint[];
  mismatchedRecords: RecordFingerprint[];
  extraRecords: RecordFingerprint[];
  postHashes: PostHashComparison[];
  draftPostCount: number;
  publishedPostCount: number;
  nullMainImageCount: number;
  nullThumbnailImageCount: number;
  warnings: SafeValidationWarning[];
  consumedCapacityUnits: number | null;
  durationMs: number;
};

export type MigrationExecutionReport = {
  runId: string;
  writtenItems: number;
  unchangedItems: number;
  transactionCount: number;
  durationMs: number;
  verification: MigrationVerificationReport;
};

export type MigrationRollbackReport = {
  runId: string;
  deletedItems: number;
  protectedItems: number;
  transactionCount: number;
  durationMs: number;
};

export type MigrationRunStatus =
  | 'planned'
  | 'dry-run'
  | 'completed'
  | 'rolled-back'
  | 'failed';

export type MigrationRunManifest = {
  manifestVersion: 1;
  toolVersion: 1;
  schemaVersion: 1;
  mode: 'dry-run' | 'execute' | 'rollback';
  status: MigrationRunStatus;
  runId: string;
  timestamp: string;
  source: SourceFileMetadata;
  target:
    | MigrationTarget
    | {
        environment: 'dry-run';
        accountId: null;
        region: null;
        tableName: null;
      };
  sourceCounts: Record<BackupTableName, number>;
  transformedCounts: TransformedCounts;
  validation: Pick<
    ValidationReport,
    'valid' | 'summary' | 'anomalies' | 'knownBaseline' | 'projection'
  >;
  postHashes: Array<{ postId: string; sha256: string }>;
  warnings: SafeValidationWarning[];
  legacy: LegacyMigrationMetadata;
  execution?: MigrationExecutionReport;
  verification?: MigrationVerificationReport;
  rollback?: MigrationRollbackReport;
  failure?: { code: string; message: string };
};
