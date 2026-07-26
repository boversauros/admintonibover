import { createHash } from 'node:crypto';

import { slugify } from '../../utils/slugify';
import { estimateDynamoDbItemSize, segmentReferences } from './dynamodb';
import {
  BACKUP_TABLE_NAMES,
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  DYNAMODB_TRANSACTION_MAX_BYTES,
  DYNAMODB_TRANSACTION_MAX_ITEMS,
  DYNAMODB_TRANSACTION_RESERVED_ACTIONS,
  DYNAMODB_TRANSACTION_RESERVED_BYTES,
  KNOWN_BACKUP_FILE_NAME,
  type AggregateReference,
  type AggregateTranslation,
  type BackupTableName,
  type BaselineCheck,
  type CategoryRow,
  type CategoryTranslationRow,
  type ImageRow,
  type IncompleteTranslation,
  type KeywordRow,
  type LanguageCode,
  type LanguageRow,
  type ParsedBackup,
  type PostAggregate,
  type PostKeywordRow,
  type PostProjectionSummary,
  type PostReferenceRow,
  type PostRow,
  type PostTranslationRow,
  type ProjectedPost,
  type ReferenceType,
  type SourceFileMetadata,
  type ValidationIssue,
  type ValidationReport,
} from './types';

type UnknownRecord = Record<string, unknown>;
type RowContext = {
  table: BackupTableName;
  rowIndex: number;
  recordId?: string;
};

type ValidationContext = {
  issues: ValidationIssue[];
};

type ValidationOptions = {
  expectKnownBaseline?: boolean;
};

const EMPTY_COUNTS = Object.fromEntries(
  BACKUP_TABLE_NAMES.map(table => [table, 0])
) as Record<BackupTableName, number>;

const TABLE_FIELDS: Record<BackupTableName, readonly string[]> = {
  languages: ['id', 'code', 'name'],
  categories: ['id', 'slug'],
  category_translations: ['id', 'category_id', 'language_id', 'name'],
  images: ['id', 'url', 'title', 'alt', 'created_at', 'updated_at'],
  posts: [
    'id',
    'category_id',
    'image_id',
    'thumbnail_id',
    'user_id',
    'author',
    'is_published',
    'sort_order',
    'date',
    'created_at',
    'updated_at',
  ],
  post_translations: [
    'id',
    'post_id',
    'language_id',
    'title',
    'content',
    'slug',
  ],
  keywords: ['id', 'keyword', 'language_id'],
  post_keywords: ['post_translation_id', 'keyword_id'],
  post_references: [
    'id',
    'post_translation_id',
    'type',
    'reference',
    'blockquote',
    'sort_order',
  ],
};

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_URL_PATTERN =
  /\b(?:https?:\/\/)?[a-z0-9-]+\.supabase\.(?:co|in)(?:[/:?#]|$)/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(context: ValidationContext, issue: ValidationIssue): void {
  context.issues.push(issue);
}

function fieldIssue(
  context: ValidationContext,
  rowContext: RowContext,
  code: string,
  message: string
): void {
  addIssue(context, {
    severity: 'error',
    code,
    message,
    ...rowContext,
  });
}

function rowRecordId(row: UnknownRecord): string | undefined {
  return normalizeIdValue(row.id);
}

function flagUnexpectedFields(
  context: ValidationContext,
  row: UnknownRecord,
  rowContext: RowContext
): void {
  const expected = new Set(TABLE_FIELDS[rowContext.table]);
  const unexpected = Object.keys(row)
    .filter(key => !expected.has(key))
    .sort();

  for (const field of unexpected) {
    addIssue(context, {
      severity: 'warning',
      code: 'UNEXPECTED_FIELD',
      message: `Unexpected field "${field}" is present and will not be projected`,
      ...rowContext,
    });
  }
}

function readRequiredValue(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): unknown | undefined {
  if (!Object.hasOwn(row, field)) {
    fieldIssue(
      context,
      rowContext,
      'REQUIRED_FIELD_MISSING',
      `Required field "${field}" is missing`
    );
    return undefined;
  }
  return row[field];
}

function normalizeIdValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value.toString();
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return value;
  }
  return undefined;
}

function readId(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): string | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;

  const id = normalizeIdValue(value);
  if (id === undefined) {
    fieldIssue(
      context,
      rowContext,
      'INVALID_ID',
      `Field "${field}" must be a positive integer ID`
    );
  }
  return id;
}

function readNullableId(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): string | null | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (value === null) return null;

  const id = normalizeIdValue(value);
  if (id === undefined) {
    fieldIssue(
      context,
      rowContext,
      'INVALID_NULLABLE_ID',
      `Field "${field}" must be null or a positive integer ID`
    );
  }
  return id;
}

function readString(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext,
  options: {
    allowEmpty?: boolean;
    maxLength?: number;
  } = {}
): string | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    fieldIssue(
      context,
      rowContext,
      'INVALID_STRING',
      `Field "${field}" must be a string`
    );
    return undefined;
  }
  if (!options.allowEmpty && value.length === 0) {
    fieldIssue(
      context,
      rowContext,
      'EMPTY_REQUIRED_STRING',
      `Field "${field}" must not be empty`
    );
  }
  if (
    options.maxLength !== undefined &&
    Array.from(value).length > options.maxLength
  ) {
    fieldIssue(
      context,
      rowContext,
      'STRING_TOO_LONG',
      `Field "${field}" exceeds ${options.maxLength} characters`
    );
  }
  return value;
}

function readNullableString(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext,
  maxLength: number
): string | null | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    fieldIssue(
      context,
      rowContext,
      'INVALID_NULLABLE_STRING',
      `Field "${field}" must be null or a string`
    );
    return undefined;
  }
  if (Array.from(value).length > maxLength) {
    fieldIssue(
      context,
      rowContext,
      'STRING_TOO_LONG',
      `Field "${field}" exceeds ${maxLength} characters`
    );
  }
  return value;
}

function readBoolean(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): boolean | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    fieldIssue(
      context,
      rowContext,
      'INVALID_BOOLEAN',
      `Field "${field}" must be a Boolean`
    );
    return undefined;
  }
  return value;
}

function readInteger(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): number | undefined {
  const value = readRequiredValue(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fieldIssue(
      context,
      rowContext,
      'INVALID_INTEGER',
      `Field "${field}" must be a safe integer`
    );
    return undefined;
  }
  return value;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readDate(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): string | undefined {
  const value = readString(context, row, field, rowContext);
  if (value === undefined) return undefined;
  if (!validCalendarDate(value)) {
    fieldIssue(
      context,
      rowContext,
      'MALFORMED_DATE',
      `Field "${field}" must be a valid YYYY-MM-DD calendar date`
    );
    return undefined;
  }
  return value;
}

function normalizeTimestamp(value: string): string | undefined {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  return new Date(milliseconds).toISOString();
}

function readTimestamp(
  context: ValidationContext,
  row: UnknownRecord,
  field: string,
  rowContext: RowContext
): string | undefined {
  const value = readString(context, row, field, rowContext);
  if (value === undefined) return undefined;
  const normalized = normalizeTimestamp(value);
  if (normalized === undefined) {
    fieldIssue(
      context,
      rowContext,
      'MALFORMED_TIMESTAMP',
      `Field "${field}" must be an ISO-8601 timestamp with a timezone`
    );
  }
  return normalized;
}

function parseLanguageRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): LanguageRow | null {
  const rowContext = {
    table: 'languages' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const rawCode = readString(context, row, 'code', rowContext);
  const name = readString(context, row, 'name', rowContext);

  let code: LanguageCode | undefined;
  if (rawCode === 'ca' || rawCode === 'en') {
    code = rawCode;
  } else if (rawCode !== undefined) {
    fieldIssue(
      context,
      rowContext,
      'UNSUPPORTED_LANGUAGE',
      'Language code must be "ca" or "en"'
    );
  }

  return id !== undefined && code !== undefined && name !== undefined
    ? { id, code, name }
    : null;
}

function parseCategoryRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): CategoryRow | null {
  const rowContext = {
    table: 'categories' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const slug = readString(context, row, 'slug', rowContext);
  return id !== undefined && slug !== undefined ? { id, slug } : null;
}

function parseCategoryTranslationRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): CategoryTranslationRow | null {
  const rowContext = {
    table: 'category_translations' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const categoryId = readId(context, row, 'category_id', rowContext);
  const languageId = readId(context, row, 'language_id', rowContext);
  const name = readString(context, row, 'name', rowContext, {
    maxLength: 120,
  });

  return id !== undefined &&
    categoryId !== undefined &&
    languageId !== undefined &&
    name !== undefined
    ? { id, categoryId, languageId, name }
    : null;
}

function parseImageRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): ImageRow | null {
  const rowContext = {
    table: 'images' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const url = readString(context, row, 'url', rowContext, {
    maxLength: 2048,
  });
  const title = readNullableString(context, row, 'title', rowContext, 200);
  const alt = readNullableString(context, row, 'alt', rowContext, 300);
  const createdAt = readTimestamp(context, row, 'created_at', rowContext);
  const updatedAt = readTimestamp(context, row, 'updated_at', rowContext);

  if (url !== undefined) {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('unsupported protocol');
      }
    } catch {
      fieldIssue(
        context,
        rowContext,
        'MALFORMED_IMAGE_URL',
        'Field "url" must be an absolute HTTP(S) URL'
      );
    }
  }

  return id !== undefined &&
    url !== undefined &&
    title !== undefined &&
    alt !== undefined &&
    createdAt !== undefined &&
    updatedAt !== undefined
    ? { id, url, title, alt, createdAt, updatedAt }
    : null;
}

function parsePostRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): PostRow | null {
  const rowContext = {
    table: 'posts' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const categoryId = readId(context, row, 'category_id', rowContext);
  const imageId = readNullableId(context, row, 'image_id', rowContext);
  const thumbnailId = readNullableId(context, row, 'thumbnail_id', rowContext);
  const userId = readString(context, row, 'user_id', rowContext);
  const author = readString(context, row, 'author', rowContext, {
    maxLength: 120,
  });
  const published = readBoolean(context, row, 'is_published', rowContext);
  const sortOrder = readInteger(context, row, 'sort_order', rowContext);
  const date = readDate(context, row, 'date', rowContext);
  const createdAt = readTimestamp(context, row, 'created_at', rowContext);
  const updatedAt = readTimestamp(context, row, 'updated_at', rowContext);

  if (userId !== undefined && !UUID_PATTERN.test(userId)) {
    fieldIssue(
      context,
      rowContext,
      'MALFORMED_USER_ID',
      'Field "user_id" must be a UUID'
    );
  }

  return id !== undefined &&
    categoryId !== undefined &&
    imageId !== undefined &&
    thumbnailId !== undefined &&
    userId !== undefined &&
    author !== undefined &&
    published !== undefined &&
    sortOrder !== undefined &&
    date !== undefined &&
    createdAt !== undefined &&
    updatedAt !== undefined
    ? {
        id,
        categoryId,
        imageId,
        thumbnailId,
        userId,
        author,
        published,
        sortOrder,
        date,
        createdAt,
        updatedAt,
      }
    : null;
}

function parsePostTranslationRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): PostTranslationRow | null {
  const rowContext = {
    table: 'post_translations' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const postId = readId(context, row, 'post_id', rowContext);
  const languageId = readId(context, row, 'language_id', rowContext);
  const title = readString(context, row, 'title', rowContext, {
    allowEmpty: true,
    maxLength: 200,
  });
  const content = readString(context, row, 'content', rowContext, {
    allowEmpty: true,
    maxLength: 50000,
  });
  const slug = readString(context, row, 'slug', rowContext, {
    allowEmpty: true,
    maxLength: 250,
  });

  return id !== undefined &&
    postId !== undefined &&
    languageId !== undefined &&
    title !== undefined &&
    content !== undefined &&
    slug !== undefined
    ? { id, postId, languageId, title, content, slug }
    : null;
}

function parseKeywordRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): KeywordRow | null {
  const rowContext = {
    table: 'keywords' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const keyword = readString(context, row, 'keyword', rowContext, {
    maxLength: 60,
  });
  const languageId = readId(context, row, 'language_id', rowContext);

  return id !== undefined && keyword !== undefined && languageId !== undefined
    ? { id, keyword, languageId }
    : null;
}

function parsePostKeywordRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): PostKeywordRow | null {
  const rowContext = {
    table: 'post_keywords' as const,
    rowIndex,
  };
  flagUnexpectedFields(context, row, rowContext);
  const postTranslationId = readId(
    context,
    row,
    'post_translation_id',
    rowContext
  );
  const keywordId = readId(context, row, 'keyword_id', rowContext);

  return postTranslationId !== undefined && keywordId !== undefined
    ? { postTranslationId, keywordId }
    : null;
}

function parsePostReferenceRow(
  context: ValidationContext,
  row: UnknownRecord,
  rowIndex: number
): PostReferenceRow | null {
  const rowContext = {
    table: 'post_references' as const,
    rowIndex,
    recordId: rowRecordId(row),
  };
  flagUnexpectedFields(context, row, rowContext);
  const id = readId(context, row, 'id', rowContext);
  const postTranslationId = readId(
    context,
    row,
    'post_translation_id',
    rowContext
  );
  const rawType = readString(context, row, 'type', rowContext);
  const reference = readString(context, row, 'reference', rowContext, {
    maxLength: 2048,
  });
  const blockquote = readNullableString(
    context,
    row,
    'blockquote',
    rowContext,
    2000
  );
  const sortOrder = readInteger(context, row, 'sort_order', rowContext);

  let type: ReferenceType | undefined;
  if (rawType === 'image' || rawType === 'text') {
    type = rawType;
  } else if (rawType !== undefined) {
    fieldIssue(
      context,
      rowContext,
      'INVALID_REFERENCE_TYPE',
      'Field "type" must be "image" or "text"'
    );
  }

  return id !== undefined &&
    postTranslationId !== undefined &&
    type !== undefined &&
    reference !== undefined &&
    blockquote !== undefined &&
    sortOrder !== undefined
    ? {
        id,
        postTranslationId,
        type,
        reference,
        blockquote,
        sortOrder,
      }
    : null;
}

function parseRows<T>(
  context: ValidationContext,
  rows: unknown[],
  table: BackupTableName,
  parser: (
    context: ValidationContext,
    row: UnknownRecord,
    rowIndex: number
  ) => T | null
): T[] {
  const parsed: T[] = [];
  rows.forEach((row, rowIndex) => {
    if (!isRecord(row)) {
      addIssue(context, {
        severity: 'error',
        code: 'INVALID_ROW',
        message: 'Table row must be a JSON object',
        table,
        rowIndex,
      });
      return;
    }
    const result = parser(context, row, rowIndex);
    if (result !== null) parsed.push(result);
  });
  return parsed;
}

function readTableRows(
  context: ValidationContext,
  tables: UnknownRecord,
  table: BackupTableName
): unknown[] {
  const value = tables[table];
  if (value === undefined) {
    addIssue(context, {
      severity: 'error',
      code: 'TABLE_MISSING',
      message: `Required table "${table}" is missing`,
      table,
    });
    return [];
  }
  if (!Array.isArray(value)) {
    addIssue(context, {
      severity: 'error',
      code: 'TABLE_NOT_ARRAY',
      message: `Table "${table}" must be an array`,
      table,
    });
    return [];
  }
  return value;
}

function parseManifest(
  context: ValidationContext,
  value: unknown,
  counts: Record<BackupTableName, number>
): ParsedBackup['manifest'] {
  const rowCounts = { ...EMPTY_COUNTS };
  if (!isRecord(value)) {
    addIssue(context, {
      severity: 'error',
      code: 'MANIFEST_MISSING',
      message: 'Top-level "manifest" must be an object',
    });
    return {
      version: 0,
      exportedAt: '',
      schemaMigration: '',
      rowCounts,
    };
  }

  const version = value.version;
  if (version !== 1) {
    addIssue(context, {
      severity: 'error',
      code: 'UNSUPPORTED_MANIFEST_VERSION',
      message: 'Manifest version must be 1',
    });
  }

  const exportedAt =
    typeof value.exported_at === 'string'
      ? normalizeTimestamp(value.exported_at)
      : undefined;
  if (exportedAt === undefined) {
    addIssue(context, {
      severity: 'error',
      code: 'MALFORMED_MANIFEST_TIMESTAMP',
      message:
        'Manifest "exported_at" must be an ISO-8601 timestamp with a timezone',
    });
  }

  if (
    typeof value.source_project_url !== 'string' ||
    value.source_project_url.length === 0
  ) {
    addIssue(context, {
      severity: 'error',
      code: 'INVALID_SOURCE_PROJECT_URL',
      message: 'Manifest "source_project_url" must be a non-empty string',
    });
  }

  const schemaMigration =
    typeof value.schema_migration === 'string'
      ? value.schema_migration
      : undefined;
  if (schemaMigration === undefined || schemaMigration.length === 0) {
    addIssue(context, {
      severity: 'error',
      code: 'INVALID_SCHEMA_MIGRATION',
      message: 'Manifest "schema_migration" must be a non-empty string',
    });
  }

  if (!isRecord(value.row_counts)) {
    addIssue(context, {
      severity: 'error',
      code: 'INVALID_MANIFEST_COUNTS',
      message: 'Manifest "row_counts" must be an object',
    });
  } else {
    for (const table of BACKUP_TABLE_NAMES) {
      const count = value.row_counts[table];
      if (
        typeof count !== 'number' ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        addIssue(context, {
          severity: 'error',
          code: 'INVALID_MANIFEST_COUNT',
          message: `Manifest row count for "${table}" must be a non-negative integer`,
          table,
        });
        continue;
      }
      rowCounts[table] = count;
      if (count !== counts[table]) {
        addIssue(context, {
          severity: 'error',
          code: 'MANIFEST_COUNT_MISMATCH',
          message: `Manifest count for "${table}" does not match the table length`,
          table,
        });
      }
    }
  }

  return {
    version: version === 1 ? 1 : 0,
    exportedAt: exportedAt ?? '',
    schemaMigration: schemaMigration ?? '',
    rowCounts,
  };
}

function parseBackupDocument(
  context: ValidationContext,
  input: unknown
): {
  backup: ParsedBackup;
  counts: Record<BackupTableName, number>;
} {
  const counts = { ...EMPTY_COUNTS };
  let tables: UnknownRecord = {};

  if (!isRecord(input)) {
    addIssue(context, {
      severity: 'error',
      code: 'INVALID_BACKUP_ROOT',
      message: 'Backup root must be a JSON object',
    });
  } else {
    for (const key of Object.keys(input).sort()) {
      if (key !== 'manifest' && key !== 'tables') {
        addIssue(context, {
          severity: 'warning',
          code: 'UNEXPECTED_TOP_LEVEL_FIELD',
          message: `Unexpected top-level field "${key}" will be ignored`,
        });
      }
    }
    if (isRecord(input.tables)) {
      tables = input.tables;
    } else {
      addIssue(context, {
        severity: 'error',
        code: 'TABLES_MISSING',
        message: 'Top-level "tables" must be an object',
      });
    }
  }

  for (const table of BACKUP_TABLE_NAMES) {
    const value = tables[table];
    if (Array.isArray(value)) counts[table] = value.length;
  }

  for (const table of Object.keys(tables).sort()) {
    if (!BACKUP_TABLE_NAMES.includes(table as BackupTableName)) {
      addIssue(context, {
        severity: 'warning',
        code: 'UNEXPECTED_TABLE',
        message: `Unexpected table "${table}" will not be projected`,
      });
    }
  }

  const manifest = parseManifest(
    context,
    isRecord(input) ? input.manifest : undefined,
    counts
  );
  const languageRows = readTableRows(context, tables, 'languages');
  const categoryRows = readTableRows(context, tables, 'categories');
  const categoryTranslationRows = readTableRows(
    context,
    tables,
    'category_translations'
  );
  const imageRows = readTableRows(context, tables, 'images');
  const postRows = readTableRows(context, tables, 'posts');
  const postTranslationRows = readTableRows(
    context,
    tables,
    'post_translations'
  );
  const keywordRows = readTableRows(context, tables, 'keywords');
  const postKeywordRows = readTableRows(context, tables, 'post_keywords');
  const postReferenceRows = readTableRows(context, tables, 'post_references');

  return {
    counts,
    backup: {
      manifest,
      languages: parseRows(
        context,
        languageRows,
        'languages',
        parseLanguageRow
      ),
      categories: parseRows(
        context,
        categoryRows,
        'categories',
        parseCategoryRow
      ),
      categoryTranslations: parseRows(
        context,
        categoryTranslationRows,
        'category_translations',
        parseCategoryTranslationRow
      ),
      images: parseRows(context, imageRows, 'images', parseImageRow),
      posts: parseRows(context, postRows, 'posts', parsePostRow),
      postTranslations: parseRows(
        context,
        postTranslationRows,
        'post_translations',
        parsePostTranslationRow
      ),
      keywords: parseRows(context, keywordRows, 'keywords', parseKeywordRow),
      postKeywords: parseRows(
        context,
        postKeywordRows,
        'post_keywords',
        parsePostKeywordRow
      ),
      postReferences: parseRows(
        context,
        postReferenceRows,
        'post_references',
        parsePostReferenceRow
      ),
    },
  };
}

function idCompare(left: string, right: string): number {
  return left.length - right.length || left.localeCompare(right);
}

function validateUniqueIds<T extends { id: string }>(
  context: ValidationContext,
  rows: T[],
  table: BackupTableName
): void {
  const seen = new Set<string>();
  rows.forEach((row, rowIndex) => {
    if (seen.has(row.id)) {
      addIssue(context, {
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `Duplicate ID in "${table}"`,
        table,
        rowIndex,
        recordId: row.id,
      });
    }
    seen.add(row.id);
  });
}

function validateUniqueComposite(
  context: ValidationContext,
  keys: string[],
  table: BackupTableName,
  code: string,
  message: string
): void {
  const seen = new Set<string>();
  keys.forEach((key, rowIndex) => {
    if (seen.has(key)) {
      addIssue(context, {
        severity: 'error',
        code,
        message,
        table,
        rowIndex,
      });
    }
    seen.add(key);
  });
}

function validateRelationships(
  context: ValidationContext,
  backup: ParsedBackup
): {
  languageById: Map<string, LanguageRow>;
  categoryById: Map<string, CategoryRow>;
  postById: Map<string, PostRow>;
  translationById: Map<string, PostTranslationRow>;
  keywordById: Map<string, KeywordRow>;
  incompleteTranslations: IncompleteTranslation[];
  embeddedSupabaseUrlCount: number;
} {
  validateUniqueIds(context, backup.languages, 'languages');
  validateUniqueIds(context, backup.categories, 'categories');
  validateUniqueIds(
    context,
    backup.categoryTranslations,
    'category_translations'
  );
  validateUniqueIds(context, backup.images, 'images');
  validateUniqueIds(context, backup.posts, 'posts');
  validateUniqueIds(context, backup.postTranslations, 'post_translations');
  validateUniqueIds(context, backup.keywords, 'keywords');
  validateUniqueIds(context, backup.postReferences, 'post_references');

  validateUniqueComposite(
    context,
    backup.postKeywords.map(row => `${row.postTranslationId}:${row.keywordId}`),
    'post_keywords',
    'DUPLICATE_KEYWORD_LINK',
    'Duplicate post-to-keyword link'
  );
  validateUniqueComposite(
    context,
    backup.categories.map(row => row.slug),
    'categories',
    'DUPLICATE_CATEGORY_SLUG',
    'Duplicate category slug'
  );
  validateUniqueComposite(
    context,
    backup.keywords.map(row => `${row.languageId}:${row.keyword}`),
    'keywords',
    'DUPLICATE_KEYWORD',
    'Duplicate keyword within a language'
  );
  validateUniqueComposite(
    context,
    backup.categoryTranslations.map(
      row => `${row.categoryId}:${row.languageId}`
    ),
    'category_translations',
    'DUPLICATE_CATEGORY_TRANSLATION',
    'Duplicate category/language translation'
  );
  validateUniqueComposite(
    context,
    backup.postTranslations.map(row => `${row.postId}:${row.languageId}`),
    'post_translations',
    'DUPLICATE_POST_TRANSLATION',
    'Duplicate post/language translation'
  );

  const languageById = new Map(backup.languages.map(row => [row.id, row]));
  const categoryById = new Map(backup.categories.map(row => [row.id, row]));
  const imageById = new Map(backup.images.map(row => [row.id, row]));
  const postById = new Map(backup.posts.map(row => [row.id, row]));
  const translationById = new Map(
    backup.postTranslations.map(row => [row.id, row])
  );
  const keywordById = new Map(backup.keywords.map(row => [row.id, row]));

  const languageCodes = new Set(backup.languages.map(row => row.code));
  for (const requiredCode of ['ca', 'en'] as const) {
    if (!languageCodes.has(requiredCode)) {
      addIssue(context, {
        severity: 'error',
        code: 'LANGUAGE_MISSING',
        message: `Required language "${requiredCode}" is missing`,
        table: 'languages',
      });
    }
  }
  validateUniqueComposite(
    context,
    backup.languages.map(row => row.code),
    'languages',
    'DUPLICATE_LANGUAGE_CODE',
    'Duplicate language code'
  );

  for (const [rowIndex, row] of backup.categoryTranslations.entries()) {
    if (!categoryById.has(row.categoryId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_CATEGORY_TRANSLATION_CATEGORY_FK',
        message: 'Category translation references a missing category',
        table: 'category_translations',
        rowIndex,
        recordId: row.id,
      });
    }
    if (!languageById.has(row.languageId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_CATEGORY_TRANSLATION_LANGUAGE_FK',
        message: 'Category translation references a missing language',
        table: 'category_translations',
        rowIndex,
        recordId: row.id,
      });
    }
  }

  const categoryLanguages = new Map<string, Set<LanguageCode>>();
  for (const row of backup.categoryTranslations) {
    const language = languageById.get(row.languageId);
    if (!language) continue;
    const codes = categoryLanguages.get(row.categoryId) ?? new Set();
    codes.add(language.code);
    categoryLanguages.set(row.categoryId, codes);
  }
  for (const category of backup.categories) {
    const codes = categoryLanguages.get(category.id);
    if (!codes?.has('ca') || !codes.has('en')) {
      addIssue(context, {
        severity: 'error',
        code: 'CATEGORY_TRANSLATION_SET_INCOMPLETE',
        message:
          'Category must have exactly one Catalan and one English translation',
        table: 'category_translations',
        recordId: category.id,
      });
    }
  }

  for (const [rowIndex, row] of backup.posts.entries()) {
    if (!categoryById.has(row.categoryId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_POST_CATEGORY_FK',
        message: 'Post references a missing category',
        table: 'posts',
        rowIndex,
        recordId: row.id,
      });
    }
    if (row.imageId !== null && !imageById.has(row.imageId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_POST_IMAGE_FK',
        message: 'Post references a missing main-image metadata row',
        table: 'posts',
        rowIndex,
        recordId: row.id,
      });
    }
    if (row.thumbnailId !== null && !imageById.has(row.thumbnailId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_POST_THUMBNAIL_FK',
        message: 'Post references a missing thumbnail metadata row',
        table: 'posts',
        rowIndex,
        recordId: row.id,
      });
    }
  }

  const postLanguages = new Map<string, Set<LanguageCode>>();
  const incompleteTranslations: IncompleteTranslation[] = [];
  const normalizedSlugOwners = new Map<string, PostTranslationRow>();
  let embeddedSupabaseUrlCount = 0;

  for (const [rowIndex, row] of backup.postTranslations.entries()) {
    const language = languageById.get(row.languageId);
    if (!postById.has(row.postId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_TRANSLATION_POST_FK',
        message: 'Post translation references a missing post',
        table: 'post_translations',
        rowIndex,
        recordId: row.id,
      });
    }
    if (!language) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_TRANSLATION_LANGUAGE_FK',
        message: 'Post translation references a missing language',
        table: 'post_translations',
        rowIndex,
        recordId: row.id,
      });
      continue;
    }

    const languages = postLanguages.get(row.postId) ?? new Set();
    languages.add(language.code);
    postLanguages.set(row.postId, languages);

    const emptyFields = (['title', 'content', 'slug'] as const).filter(
      field => row[field].length === 0
    );
    if (emptyFields.length > 0) {
      incompleteTranslations.push({
        postId: row.postId,
        translationId: row.id,
        language: language.code,
        emptyFields,
      });
      addIssue(context, {
        severity: 'warning',
        code: 'INCOMPLETE_TRANSLATION',
        message: `Translation has empty required content fields: ${emptyFields.join(', ')}`,
        table: 'post_translations',
        rowIndex,
        recordId: row.id,
      });
    }

    if (SUPABASE_URL_PATTERN.test(row.content)) {
      embeddedSupabaseUrlCount += 1;
      addIssue(context, {
        severity: 'error',
        code: 'EMBEDDED_SUPABASE_URL',
        message: 'Translation content contains a Supabase URL',
        table: 'post_translations',
        rowIndex,
        recordId: row.id,
      });
    }

    if (row.slug.length > 0) {
      const normalized = slugify(row.slug);
      if (normalized.length === 0) {
        addIssue(context, {
          severity: 'error',
          code: 'SLUG_NORMALIZES_EMPTY',
          message: 'Non-empty slug becomes empty after normalization',
          table: 'post_translations',
          rowIndex,
          recordId: row.id,
        });
      } else {
        if (normalized !== row.slug) {
          addIssue(context, {
            severity: 'warning',
            code: 'SLUG_REQUIRES_NORMALIZATION',
            message: 'Source slug differs from its normalized migration value',
            table: 'post_translations',
            rowIndex,
            recordId: row.id,
          });
        }

        const ownerKey = `${language.code}:${normalized}`;
        const existing = normalizedSlugOwners.get(ownerKey);
        if (existing && existing.postId !== row.postId) {
          const fingerprint = createHash('sha256')
            .update(ownerKey)
            .digest('hex')
            .slice(0, 12);
          addIssue(context, {
            severity: 'error',
            code: 'DUPLICATE_NORMALIZED_SLUG',
            message: `Normalized slug fingerprint ${fingerprint} is owned by multiple posts`,
            table: 'post_translations',
            rowIndex,
            recordId: row.id,
          });
        } else {
          normalizedSlugOwners.set(ownerKey, row);
        }
      }
    }
  }

  for (const post of backup.posts) {
    const codes = postLanguages.get(post.id);
    if (!codes?.has('ca') || !codes.has('en')) {
      addIssue(context, {
        severity: 'error',
        code: 'POST_TRANSLATION_SET_INCOMPLETE',
        message:
          'Post must have exactly one Catalan and one English translation row',
        table: 'post_translations',
        recordId: post.id,
      });
    }
  }

  for (const [rowIndex, row] of backup.keywords.entries()) {
    if (!languageById.has(row.languageId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_KEYWORD_LANGUAGE_FK',
        message: 'Keyword references a missing language',
        table: 'keywords',
        rowIndex,
        recordId: row.id,
      });
    }
  }

  for (const [rowIndex, row] of backup.postKeywords.entries()) {
    const translation = translationById.get(row.postTranslationId);
    const keyword = keywordById.get(row.keywordId);
    if (!translation) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_POST_KEYWORD_TRANSLATION_FK',
        message: 'Keyword link references a missing post translation',
        table: 'post_keywords',
        rowIndex,
      });
    }
    if (!keyword) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_POST_KEYWORD_KEYWORD_FK',
        message: 'Keyword link references a missing keyword',
        table: 'post_keywords',
        rowIndex,
      });
    }
    if (
      translation &&
      keyword &&
      translation.languageId !== keyword.languageId
    ) {
      addIssue(context, {
        severity: 'error',
        code: 'KEYWORD_LANGUAGE_MISMATCH',
        message:
          'Linked keyword language differs from the post translation language',
        table: 'post_keywords',
        rowIndex,
      });
    }
  }

  for (const [rowIndex, row] of backup.postReferences.entries()) {
    if (!translationById.has(row.postTranslationId)) {
      addIssue(context, {
        severity: 'error',
        code: 'BROKEN_REFERENCE_TRANSLATION_FK',
        message: 'Reference points to a missing post translation',
        table: 'post_references',
        rowIndex,
        recordId: row.id,
      });
    }
    if (
      SUPABASE_URL_PATTERN.test(row.reference) ||
      (row.blockquote !== null && SUPABASE_URL_PATTERN.test(row.blockquote))
    ) {
      embeddedSupabaseUrlCount += 1;
      addIssue(context, {
        severity: 'error',
        code: 'EMBEDDED_SUPABASE_URL',
        message: 'Reference content contains a Supabase URL',
        table: 'post_references',
        rowIndex,
        recordId: row.id,
      });
    }
  }

  return {
    languageById,
    categoryById,
    postById,
    translationById,
    keywordById,
    incompleteTranslations: incompleteTranslations.sort(
      (left, right) =>
        idCompare(left.postId, right.postId) ||
        left.language.localeCompare(right.language)
    ),
    embeddedSupabaseUrlCount,
  };
}

function aggregateReference(row: PostReferenceRow): AggregateReference {
  return {
    id: row.id,
    type: row.type,
    reference: row.reference,
    ...(row.blockquote === null ? {} : { blockquote: row.blockquote }),
    sortOrder: row.sortOrder,
  };
}

function translationStatus(row: PostTranslationRow): 'complete' | 'incomplete' {
  return row.title.length > 0 && row.content.length > 0 && row.slug.length > 0
    ? 'complete'
    : 'incomplete';
}

function omitTranslationReferences(
  translation: AggregateTranslation
): AggregateTranslation {
  return {
    legacyId: translation.legacyId,
    title: translation.title,
    content: translation.content,
    slug: translation.slug,
    keywords: translation.keywords,
    translationStatus: translation.translationStatus,
  };
}

function projectPosts(
  context: ValidationContext,
  backup: ParsedBackup,
  metadata: SourceFileMetadata,
  relations: ReturnType<typeof validateRelationships>
): ProjectedPost[] {
  const translationByPostAndLanguage = new Map<string, PostTranslationRow>();
  for (const translation of backup.postTranslations) {
    const language = relations.languageById.get(translation.languageId);
    if (!language) continue;
    translationByPostAndLanguage.set(
      `${translation.postId}:${language.code}`,
      translation
    );
  }

  const linksByTranslation = new Map<string, PostKeywordRow[]>();
  for (const link of backup.postKeywords) {
    const links = linksByTranslation.get(link.postTranslationId) ?? [];
    links.push(link);
    linksByTranslation.set(link.postTranslationId, links);
  }

  const referencesByTranslation = new Map<string, PostReferenceRow[]>();
  for (const reference of backup.postReferences) {
    const references =
      referencesByTranslation.get(reference.postTranslationId) ?? [];
    references.push(reference);
    referencesByTranslation.set(reference.postTranslationId, references);
  }

  const runId = `validation-${metadata.sha256.slice(0, 16)}`;
  const projected: ProjectedPost[] = [];

  for (const post of [...backup.posts].sort((left, right) =>
    idCompare(left.id, right.id)
  )) {
    const category = relations.categoryById.get(post.categoryId);
    const caRow = translationByPostAndLanguage.get(`${post.id}:ca`);
    const enRow = translationByPostAndLanguage.get(`${post.id}:en`);
    if (!category || !caRow || !enRow) continue;

    const sourceRows: Record<LanguageCode, PostTranslationRow> = {
      ca: caRow,
      en: enRow,
    };
    const referenceLists = {} as Record<LanguageCode, AggregateReference[]>;
    const translations = {} as Record<LanguageCode, AggregateTranslation>;

    for (const language of ['ca', 'en'] as const) {
      const translation = sourceRows[language];
      const keywords = (linksByTranslation.get(translation.id) ?? [])
        .map(link => relations.keywordById.get(link.keywordId))
        .filter((row): row is KeywordRow => row !== undefined)
        .sort((left, right) => idCompare(left.id, right.id))
        .map(row => ({
          legacyId: row.id,
          value: row.keyword,
        }));
      const references = (referencesByTranslation.get(translation.id) ?? [])
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || idCompare(left.id, right.id)
        )
        .map(aggregateReference);
      referenceLists[language] = references;
      translations[language] = {
        legacyId: translation.id,
        title: translation.title,
        content: translation.content,
        slug: translation.slug.length === 0 ? '' : slugify(translation.slug),
        keywords,
        references,
        translationStatus: translationStatus(translation),
      };
    }

    const inlineAggregate: PostAggregate = {
      PK: `POST#${post.id}`,
      SK: `POST#${post.id}`,
      entityType: 'POST',
      schemaVersion: 1,
      id: post.id,
      category: {
        id: category.id,
        slug: category.slug,
      },
      sortOrder: post.sortOrder,
      published: post.published,
      date: post.date,
      author: post.author,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      translations,
      referenceStorage: 'inline',
      mainImage: null,
      thumbImage: null,
      version: 1,
      migration: {
        source: 'supabase-backup',
        runId,
      },
    };

    const inlineBytes = estimateDynamoDbItemSize(inlineAggregate);
    let aggregate = inlineAggregate;
    let referenceSegments: ProjectedPost['referenceSegments'] = [];

    if (inlineBytes >= DYNAMODB_ITEM_SIZE_GUARD_BYTES) {
      const caSegments = segmentReferences(post.id, 'ca', referenceLists.ca);
      const enSegments = segmentReferences(post.id, 'en', referenceLists.en);
      referenceSegments = [...caSegments, ...enSegments];

      aggregate = {
        ...inlineAggregate,
        translations: {
          ca: omitTranslationReferences(inlineAggregate.translations.ca),
          en: omitTranslationReferences(inlineAggregate.translations.en),
        },
        referenceStorage: 'segmented',
        referenceSegmentCounts: {
          ca: caSegments.length,
          en: enSegments.length,
        },
      };
    }

    const aggregateBytes = estimateDynamoDbItemSize(aggregate);
    const segmentSizes = referenceSegments.map(segment =>
      estimateDynamoDbItemSize(segment)
    );
    const slugLockCount = (['ca', 'en'] as const).filter(
      language => aggregate.translations[language].slug.length > 0
    ).length;
    const transactionItemCount =
      DYNAMODB_TRANSACTION_RESERVED_ACTIONS +
      slugLockCount +
      referenceSegments.length;
    const transactionBytes =
      DYNAMODB_TRANSACTION_RESERVED_BYTES +
      aggregateBytes +
      segmentSizes.reduce((total, size) => total + size, 0);
    const largestReferenceSegmentBytes = Math.max(0, ...segmentSizes);

    if (aggregateBytes >= DYNAMODB_ITEM_SIZE_GUARD_BYTES) {
      addIssue(context, {
        severity: 'error',
        code: 'OVERSIZED_AGGREGATE',
        message: `Projected base aggregate is ${aggregateBytes} bytes and reaches the 358400-byte guard`,
        table: 'posts',
        recordId: post.id,
      });
    }
    if (segmentSizes.some(size => size >= DYNAMODB_ITEM_SIZE_GUARD_BYTES)) {
      addIssue(context, {
        severity: 'error',
        code: 'OVERSIZED_REFERENCE_SEGMENT',
        message:
          'At least one projected reference segment reaches the 358400-byte guard',
        table: 'post_references',
        recordId: post.id,
      });
    }
    if (transactionItemCount > DYNAMODB_TRANSACTION_MAX_ITEMS) {
      addIssue(context, {
        severity: 'error',
        code: 'TRANSACTION_ITEM_LIMIT_EXCEEDED',
        message: `Projected transaction requires ${transactionItemCount} items; the limit is 100`,
        table: 'posts',
        recordId: post.id,
      });
    }
    if (transactionBytes > DYNAMODB_TRANSACTION_MAX_BYTES) {
      addIssue(context, {
        severity: 'error',
        code: 'TRANSACTION_SIZE_LIMIT_EXCEEDED',
        message: `Projected transaction estimate is ${transactionBytes} bytes and exceeds 4 MiB`,
        table: 'posts',
        recordId: post.id,
      });
    }

    const summary: PostProjectionSummary = {
      postId: post.id,
      referenceStorage: aggregate.referenceStorage,
      aggregateBytes,
      referenceSegmentCounts: aggregate.referenceSegmentCounts ?? {
        ca: 0,
        en: 0,
      },
      largestReferenceSegmentBytes,
      transactionItemCount,
      transactionBytes,
      slugLockCount,
    };

    projected.push({ aggregate, referenceSegments, summary });
  }

  return projected;
}

function baselineCheck(
  name: string,
  expected: BaselineCheck['expected'],
  actual: BaselineCheck['actual']
): BaselineCheck {
  return { name, expected, actual, matches: expected === actual };
}

function knownBaseline(
  context: ValidationContext,
  counts: Record<BackupTableName, number>,
  metadata: SourceFileMetadata,
  options: ValidationOptions,
  backup: ParsedBackup,
  incompleteTranslations: IncompleteTranslation[],
  embeddedSupabaseUrlCount: number,
  projectedPostCount: number
): ValidationReport['knownBaseline'] {
  const post64En = incompleteTranslations.find(
    translation => translation.postId === '64' && translation.language === 'en'
  );
  const post64AnomalyMatches =
    post64En?.emptyFields.length === 2 &&
    post64En.emptyFields.includes('title') &&
    post64En.emptyFields.includes('slug');
  const draftCount = backup.posts.filter(post => !post.published).length;

  const checks = [
    baselineCheck('posts', 100, counts.posts),
    baselineCheck('post_translations', 200, counts.post_translations),
    baselineCheck('categories', 3, counts.categories),
    baselineCheck('category_translations', 6, counts.category_translations),
    baselineCheck('languages', 2, counts.languages),
    baselineCheck('keywords', 94, counts.keywords),
    baselineCheck('post_keywords', 598, counts.post_keywords),
    baselineCheck('post_references', 1321, counts.post_references),
    baselineCheck('images', 229, counts.images),
    baselineCheck('draft_posts', 100, draftCount),
    baselineCheck(
      'post_64_en_empty_title_and_slug',
      true,
      post64AnomalyMatches
    ),
    baselineCheck('embedded_supabase_urls', 0, embeddedSupabaseUrlCount),
    baselineCheck('projected_null_main_images', 100, projectedPostCount),
    baselineCheck('projected_null_thumbnail_images', 100, projectedPostCount),
  ];
  const enforced =
    options.expectKnownBaseline === true ||
    metadata.fileName === KNOWN_BACKUP_FILE_NAME;
  const matches = checks.every(check => check.matches);

  if (enforced && !matches) {
    addIssue(context, {
      severity: 'error',
      code: 'KNOWN_BASELINE_MISMATCH',
      message: 'Backup does not match the enforced June 2026 source baseline',
    });
  }

  return {
    profile: 'tonibover-2026-06-18',
    enforced,
    matches,
    checks,
  };
}

function issueCompare(left: ValidationIssue, right: ValidationIssue): number {
  const severityOrder = { error: 0, warning: 1 };
  const tableOrder = new Map(
    BACKUP_TABLE_NAMES.map((table, index) => [table, index])
  );
  return (
    severityOrder[left.severity] - severityOrder[right.severity] ||
    (tableOrder.get(left.table as BackupTableName) ?? -1) -
      (tableOrder.get(right.table as BackupTableName) ?? -1) ||
    (left.rowIndex ?? -1) - (right.rowIndex ?? -1) ||
    left.code.localeCompare(right.code) ||
    (left.recordId ?? '').localeCompare(right.recordId ?? '')
  );
}

export function validateAndProjectBackupDocument(
  input: unknown,
  metadata: SourceFileMetadata,
  options: ValidationOptions = {}
): {
  report: ValidationReport;
  projectedPosts: ProjectedPost[];
} {
  const context: ValidationContext = { issues: [] };
  const { backup, counts } = parseBackupDocument(context, input);
  const relations = validateRelationships(context, backup);
  const projected = projectPosts(context, backup, metadata, relations);
  const projectedSummaries = projected.map(post => post.summary);
  const baseline = knownBaseline(
    context,
    counts,
    metadata,
    options,
    backup,
    relations.incompleteTranslations,
    relations.embeddedSupabaseUrlCount,
    projected.length
  );

  const issues = context.issues.sort(issueCompare);
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const sourceMainImageLinkCount = backup.posts.filter(
    post => post.imageId !== null
  ).length;
  const sourceThumbnailImageLinkCount = backup.posts.filter(
    post => post.thumbnailId !== null
  ).length;

  const report: ValidationReport = {
    reportVersion: 1,
    validatorVersion: 1,
    source: metadata,
    sourceIntegrity: {
      hashUnchanged: true,
      modificationTimeUnchanged: true,
    },
    valid: errorCount === 0,
    summary: { errorCount, warningCount },
    counts,
    anomalies: {
      draftPostCount: backup.posts.filter(post => !post.published).length,
      publishedPostCount: backup.posts.filter(post => post.published).length,
      incompleteTranslations: relations.incompleteTranslations,
      embeddedSupabaseUrlCount: relations.embeddedSupabaseUrlCount,
      sourceMainImageLinkCount,
      sourceThumbnailImageLinkCount,
      projectedNullMainImageCount: projected.length,
      projectedNullThumbnailImageCount: projected.length,
    },
    knownBaseline: baseline,
    projection: {
      projectedPostCount: projected.length,
      inlinePostCount: projectedSummaries.filter(
        post => post.referenceStorage === 'inline'
      ).length,
      segmentedPostCount: projectedSummaries.filter(
        post => post.referenceStorage === 'segmented'
      ).length,
      largestItemBytes: Math.max(
        0,
        ...projectedSummaries.flatMap(post => [
          post.aggregateBytes,
          post.largestReferenceSegmentBytes,
        ])
      ),
      posts: projectedSummaries,
    },
    issues,
  };

  return { report, projectedPosts: projected };
}

export function validateBackupDocument(
  input: unknown,
  metadata: SourceFileMetadata,
  options: ValidationOptions = {}
): ValidationReport {
  return validateAndProjectBackupDocument(input, metadata, options).report;
}
