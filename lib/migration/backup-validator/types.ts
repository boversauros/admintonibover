export const BACKUP_TABLE_NAMES = [
  'languages',
  'categories',
  'category_translations',
  'images',
  'posts',
  'post_translations',
  'keywords',
  'post_keywords',
  'post_references',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];
export type LanguageCode = 'ca' | 'en';
export type ReferenceType = 'image' | 'text';

export {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  DYNAMODB_TRANSACTION_MAX_BYTES,
  DYNAMODB_TRANSACTION_MAX_ITEMS,
  REFERENCE_SEGMENT_TARGET_BYTES,
} from '../../aws/dynamodb/limits';

export const KNOWN_BACKUP_FILE_NAME =
  'tonibover-backup-2026-06-18T08-46-31.json';
export const DYNAMODB_TRANSACTION_RESERVED_ACTIONS = 7;
export const DYNAMODB_TRANSACTION_RESERVED_BYTES = 64 * 1024;

export type SourceFileMetadata = {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  modifiedTimeNs: string;
};

export type SourceIntegrity = {
  hashUnchanged: boolean;
  modificationTimeUnchanged: boolean;
};

export type ValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  table?: BackupTableName;
  rowIndex?: number;
  recordId?: string;
};

export type IncompleteTranslation = {
  postId: string;
  translationId: string;
  language: LanguageCode;
  emptyFields: Array<'title' | 'content' | 'slug'>;
};

export type BaselineCheck = {
  name: string;
  expected: boolean | number | string;
  actual: boolean | number | string;
  matches: boolean;
};

export type KnownBaselineReport = {
  profile: 'tonibover-2026-06-18';
  enforced: boolean;
  matches: boolean;
  checks: BaselineCheck[];
};

export type PostProjectionSummary = {
  postId: string;
  referenceStorage: 'inline' | 'segmented';
  aggregateBytes: number;
  referenceSegmentCounts: Record<LanguageCode, number>;
  largestReferenceSegmentBytes: number;
  transactionItemCount: number;
  transactionBytes: number;
  slugLockCount: number;
};

export type ValidationReport = {
  reportVersion: 1;
  validatorVersion: 1;
  source: SourceFileMetadata;
  sourceIntegrity: SourceIntegrity;
  valid: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
  };
  counts: Record<BackupTableName, number>;
  anomalies: {
    draftPostCount: number;
    publishedPostCount: number;
    incompleteTranslations: IncompleteTranslation[];
    embeddedSupabaseUrlCount: number;
    sourceMainImageLinkCount: number;
    sourceThumbnailImageLinkCount: number;
    projectedNullMainImageCount: number;
    projectedNullThumbnailImageCount: number;
  };
  knownBaseline: KnownBaselineReport;
  projection: {
    projectedPostCount: number;
    inlinePostCount: number;
    segmentedPostCount: number;
    largestItemBytes: number;
    posts: PostProjectionSummary[];
  };
  issues: ValidationIssue[];
};

export type LanguageRow = {
  id: string;
  code: LanguageCode;
  name: string;
};

export type CategoryRow = {
  id: string;
  slug: string;
};

export type CategoryTranslationRow = {
  id: string;
  categoryId: string;
  languageId: string;
  name: string;
};

export type ImageRow = {
  id: string;
  url: string;
  title: string | null;
  alt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PostRow = {
  id: string;
  categoryId: string;
  imageId: string | null;
  thumbnailId: string | null;
  userId: string;
  author: string;
  published: boolean;
  sortOrder: number;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type PostTranslationRow = {
  id: string;
  postId: string;
  languageId: string;
  title: string;
  content: string;
  slug: string;
};

export type KeywordRow = {
  id: string;
  keyword: string;
  languageId: string;
};

export type PostKeywordRow = {
  postTranslationId: string;
  keywordId: string;
};

export type PostReferenceRow = {
  id: string;
  postTranslationId: string;
  type: ReferenceType;
  reference: string;
  blockquote: string | null;
  sortOrder: number;
};

export type ParsedBackup = {
  manifest: {
    version: number;
    exportedAt: string;
    schemaMigration: string;
    rowCounts: Record<BackupTableName, number>;
  };
  languages: LanguageRow[];
  categories: CategoryRow[];
  categoryTranslations: CategoryTranslationRow[];
  images: ImageRow[];
  posts: PostRow[];
  postTranslations: PostTranslationRow[];
  keywords: KeywordRow[];
  postKeywords: PostKeywordRow[];
  postReferences: PostReferenceRow[];
};

export type AggregateKeyword = {
  legacyId: string;
  value: string;
};

export type AggregateReference = {
  id: string;
  type: ReferenceType;
  reference: string;
  blockquote?: string;
  sortOrder: number;
};

export type AggregateTranslation = {
  legacyId: string;
  title: string;
  content: string;
  slug: string;
  keywords: AggregateKeyword[];
  references?: AggregateReference[];
  translationStatus: 'complete' | 'incomplete';
};

export type PostAggregate = {
  PK: string;
  SK: string;
  entityType: 'POST';
  schemaVersion: 1;
  id: string;
  category: {
    id: string;
    slug: string;
  };
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  translations: Record<LanguageCode, AggregateTranslation>;
  referenceStorage: 'inline' | 'segmented';
  referenceSegmentCounts?: Record<LanguageCode, number>;
  mainImage: null;
  thumbImage: null;
  version: 1;
  migration: {
    source: 'supabase-backup';
    runId: string;
  };
};

export type ReferenceSegment = {
  PK: string;
  SK: string;
  entityType: 'REFERENCE_SEGMENT';
  schemaVersion: 1;
  postId: string;
  language: LanguageCode;
  sequence: number;
  version: 1;
  references: AggregateReference[];
};

export type ProjectedPost = {
  aggregate: PostAggregate;
  referenceSegments: ReferenceSegment[];
  summary: PostProjectionSummary;
};
