import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import {
  type ParsedBackup,
  type ProjectedPost,
  type SourceFileMetadata,
  type ValidationReport,
} from './types';
import { validateAndProjectBackupDocument } from './validator';

export {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  KNOWN_BACKUP_FILE_NAME,
  REFERENCE_SEGMENT_TARGET_BYTES,
} from './types';
export { estimateDynamoDbItemSize } from './dynamodb';
export type {
  PostAggregate,
  ParsedBackup,
  PostProjectionSummary,
  ProjectedPost,
  ReferenceSegment,
  ValidationIssue,
  ValidationReport,
} from './types';
export {
  validateAndProjectBackupDocument,
  validateBackupDocument,
} from './validator';

export type ValidateBackupFileOptions = {
  expectKnownBaseline?: boolean;
  expectedSha256?: string;
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type ValidatedBackupProjection = {
  report: ValidationReport;
  projectedPosts: ProjectedPost[];
  backup: ParsedBackup;
};

function assertExpectedSha256(actual: string, expected?: string): void {
  if (expected === undefined) return;
  if (!/^[0-9a-f]{64}$/i.test(expected)) {
    throw new Error(
      'Expected SHA-256 must contain exactly 64 hexadecimal characters'
    );
  }
  if (actual !== expected.toLowerCase()) {
    throw new Error('Backup SHA-256 does not match the expected value');
  }
}

export async function validateAndProjectBackupFile(
  inputPath: string,
  options: ValidateBackupFileOptions = {}
): Promise<ValidatedBackupProjection> {
  const beforeStat = await stat(inputPath, { bigint: true });
  if (!beforeStat.isFile()) {
    throw new Error('Backup input path must point to a regular file');
  }

  const beforeBytes = await readFile(inputPath);
  const beforeHash = sha256(beforeBytes);
  assertExpectedSha256(beforeHash, options.expectedSha256);
  const metadata: SourceFileMetadata = {
    fileName: basename(inputPath),
    sha256: beforeHash,
    sizeBytes: Number(beforeStat.size),
    modifiedTimeNs: beforeStat.mtimeNs.toString(),
  };

  let document: unknown;
  try {
    document = JSON.parse(beforeBytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('Backup input is not valid JSON');
  }

  const projection = validateAndProjectBackupDocument(
    document,
    metadata,
    options
  );
  const { report } = projection;

  const afterBytes = await readFile(inputPath);
  const afterStat = await stat(inputPath, { bigint: true });
  const hashUnchanged = sha256(afterBytes) === beforeHash;
  const modificationTimeUnchanged = afterStat.mtimeNs === beforeStat.mtimeNs;

  report.sourceIntegrity = {
    hashUnchanged,
    modificationTimeUnchanged,
  };

  if (!hashUnchanged || !modificationTimeUnchanged) {
    report.issues.push({
      severity: 'error',
      code: 'SOURCE_CHANGED_DURING_VALIDATION',
      message:
        'Backup hash or modification time changed during read-only validation',
    });
    report.summary.errorCount += 1;
    report.valid = false;
  }

  return projection;
}

export async function validateBackupFile(
  inputPath: string,
  options: ValidateBackupFileOptions = {}
): Promise<ValidationReport> {
  return (await validateAndProjectBackupFile(inputPath, options)).report;
}

export function serializeValidationReport(report: ValidationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
