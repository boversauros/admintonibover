import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import { type SourceFileMetadata, type ValidationReport } from './types';
import { validateBackupDocument } from './validator';

export {
  DYNAMODB_ITEM_SIZE_GUARD_BYTES,
  KNOWN_BACKUP_FILE_NAME,
  REFERENCE_SEGMENT_TARGET_BYTES,
} from './types';
export { estimateDynamoDbItemSize } from './dynamodb';
export type {
  PostAggregate,
  PostProjectionSummary,
  ReferenceSegment,
  ValidationIssue,
  ValidationReport,
} from './types';
export { validateBackupDocument } from './validator';

export type ValidateBackupFileOptions = {
  expectKnownBaseline?: boolean;
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function validateBackupFile(
  inputPath: string,
  options: ValidateBackupFileOptions = {}
): Promise<ValidationReport> {
  const beforeStat = await stat(inputPath, { bigint: true });
  if (!beforeStat.isFile()) {
    throw new Error('Backup input path must point to a regular file');
  }

  const beforeBytes = await readFile(inputPath);
  const beforeHash = sha256(beforeBytes);
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

  const report = validateBackupDocument(document, metadata, options);

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

  return report;
}

export function serializeValidationReport(report: ValidationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
