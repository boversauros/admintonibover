import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import type {
  MigrationPlan,
  MigrationRunManifest,
  MigrationRunStatus,
} from './types';

export function createRunManifest(input: {
  plan: MigrationPlan;
  mode: MigrationRunManifest['mode'];
  status: MigrationRunStatus;
  timestamp: string;
}): MigrationRunManifest {
  const { plan } = input;
  return {
    manifestVersion: 1,
    toolVersion: 1,
    schemaVersion: 1,
    mode: input.mode,
    status: input.status,
    runId: plan.runId,
    timestamp: input.timestamp,
    source: { ...plan.source },
    target: plan.target
      ? { ...plan.target }
      : {
          environment: 'dry-run',
          accountId: null,
          region: null,
          tableName: null,
        },
    sourceCounts: { ...plan.sourceCounts },
    transformedCounts: { ...plan.transformedCounts },
    validation: {
      valid: plan.validation.valid,
      summary: structuredClone(plan.validation.summary),
      anomalies: structuredClone(plan.validation.anomalies),
      knownBaseline: structuredClone(plan.validation.knownBaseline),
      projection: structuredClone(plan.validation.projection),
    },
    postHashes: plan.posts.map(post => ({
      postId: post.postId,
      sha256: post.contentHash,
    })),
    warnings: structuredClone(plan.warnings),
    legacy: structuredClone(plan.legacy),
  };
}

export function safeFailure(error: unknown): { code: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const record = error as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
    };
    return {
      code:
        typeof record.code === 'string'
          ? record.code
          : typeof record.name === 'string'
            ? record.name
            : 'MIGRATION_FAILED',
      message:
        typeof record.message === 'string'
          ? record.message
          : 'Migration failed without a safe error message',
    };
  }
  return {
    code: 'MIGRATION_FAILED',
    message: 'Migration failed without a safe error message',
  };
}

export function serializeRunManifest(manifest: MigrationRunManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeRunManifest(
  manifestPath: string,
  inputPath: string,
  manifest: MigrationRunManifest
): Promise<void> {
  const resolvedManifest = resolve(manifestPath);
  if (resolvedManifest === resolve(inputPath)) {
    throw new Error('Migration manifest must not overwrite the source backup');
  }
  const temporaryPath = resolve(
    dirname(resolvedManifest),
    `.${basename(resolvedManifest)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temporaryPath, serializeRunManifest(manifest), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, resolvedManifest);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
