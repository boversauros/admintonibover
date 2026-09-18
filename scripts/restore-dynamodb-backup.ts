import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { createAwsDynamoDbPort } from '../lib/aws/dynamodb/aws-port';
import { DynamoDbPostRepository } from '../lib/aws/dynamodb/post-repository';
import {
  DynamoDbBackupRecoveryRunner,
  assertRestoreAllowed,
  createRecoveryPort,
  readBackupFile,
  recoveryFailure,
  verifyRecoveryTarget,
  type BackupFile,
  type RecoveryExecution,
  type RecoveryTarget,
} from '../lib/recovery/dynamodb-backup';

const USAGE = `Usage:
  pnpm backup:restore -- --input <path> --manifest <path>
  pnpm backup:restore -- --execute --input <path> --manifest <path> --run-id <recovery-run-id> --account-id <12-digits> --region <region> --table <name> --confirmation <exact-value>

Without --execute, the command validates and hashes the backup without contacting AWS.
Restore mode only accepts an empty, tagged, disposable development table and refuses production-looking names.`;

type CliOptions = {
  execute: boolean;
  inputPath: string;
  manifestPath: string;
  target: RecoveryTarget | null;
  confirmation?: string;
};

type RecoveryManifest = {
  manifestVersion: 1;
  status: 'validated' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  backup: {
    path: string;
    fileSha256: string;
    itemsSha256: string;
    sizeBytes: number;
    exportedAt: string;
    environment: string;
    itemCount: number;
    revision: number | null;
    entityCounts: BackupFile['backup']['manifest']['entityCounts'];
  };
  target: RecoveryTarget | null;
  execution?: RecoveryExecution;
  applicationReads?: {
    aggregateCount: number;
    listItemCount: number;
  };
  failure?: { code: string; message: string };
};

const VALUE_FLAGS = new Set([
  '--input',
  '--manifest',
  '--run-id',
  '--account-id',
  '--region',
  '--table',
  '--confirmation',
]);

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function parseArguments(args: string[]): CliOptions | null {
  let execute = false;
  let inputPath: string | undefined;
  let manifestPath: string | undefined;
  let runId: string | undefined;
  let accountId: string | undefined;
  let region: string | undefined;
  let tableName: string | undefined;
  let confirmation: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--execute') {
      execute = true;
      continue;
    }
    if (!VALUE_FLAGS.has(argument))
      throw new Error(`Unknown flag: ${argument}`);
    const value = valueAfter(args, index, argument);
    index += 1;
    switch (argument) {
      case '--input':
        inputPath = value;
        break;
      case '--manifest':
        manifestPath = value;
        break;
      case '--run-id':
        runId = value;
        break;
      case '--account-id':
        accountId = value;
        break;
      case '--region':
        region = value;
        break;
      case '--table':
        tableName = value;
        break;
      case '--confirmation':
        confirmation = value;
        break;
    }
  }

  const targetValues = [runId, accountId, region, tableName];
  if (execute && targetValues.some(value => value === undefined)) {
    throw new Error(
      '--execute requires --run-id, --account-id, --region, and --table'
    );
  }
  if (!execute && targetValues.some(value => value !== undefined)) {
    throw new Error('AWS target flags require --execute');
  }
  return {
    execute,
    inputPath: resolve(required(inputPath, '--input')),
    manifestPath: resolve(required(manifestPath, '--manifest')),
    target: execute
      ? {
          runId: runId!,
          accountId: accountId!,
          region: region!,
          tableName: tableName!,
        }
      : null,
    ...(confirmation ? { confirmation } : {}),
  };
}

function createManifest(
  options: CliOptions,
  source: BackupFile,
  startedAt: string
): RecoveryManifest {
  return {
    manifestVersion: 1,
    status: 'validated',
    startedAt,
    completedAt: null,
    backup: {
      path: options.inputPath,
      fileSha256: source.fileSha256,
      itemsSha256: source.backup.manifest.sha256,
      sizeBytes: source.sizeBytes,
      exportedAt: source.backup.exportedAt,
      environment: source.backup.environment,
      itemCount: source.backup.manifest.itemCount,
      revision: source.backup.manifest.revision,
      entityCounts: { ...source.backup.manifest.entityCounts },
    },
    target: options.target ? { ...options.target } : null,
  };
}

async function writeManifest(
  manifestPath: string,
  inputPath: string,
  manifest: RecoveryManifest
): Promise<void> {
  if (resolve(manifestPath) === resolve(inputPath)) {
    throw new Error('Recovery manifest must not overwrite the backup');
  }
  await mkdir(dirname(manifestPath), { recursive: true });
  const temporaryPath = resolve(
    dirname(manifestPath),
    `.${basename(manifestPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function representativePostIds(source: BackupFile): string[] {
  const ids = source.backup.items
    .filter(item => item.entityType === 'POST' && typeof item.id === 'string')
    .map(item => item.id as string)
    .sort((left, right) => left.localeCompare(right));
  if (ids.length <= 3) return ids;
  return [ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)!];
}

async function verifyApplicationReads(
  source: BackupFile,
  target: RecoveryTarget,
  client: DynamoDBClient
): Promise<{ aggregateCount: number; listItemCount: number }> {
  const repository = new DynamoDbPostRepository(
    createAwsDynamoDbPort(target.tableName, client)
  );
  const ids = representativePostIds(source);
  for (const id of ids) {
    const post = await repository.getById(id);
    if (!post || post.id !== id) {
      throw new Error('A representative restored post could not be parsed');
    }
  }
  const list = await repository.list({ limit: Math.max(1, ids.length) });
  if (list.items.length < ids.length) {
    throw new Error('Restored post summaries could not be parsed');
  }
  return { aggregateCount: ids.length, listItemCount: list.items.length };
}

function safeSummary(manifest: RecoveryManifest, manifestPath: string): string {
  return `${JSON.stringify({
    status: manifest.status,
    itemCount: manifest.backup.itemCount,
    revision: manifest.backup.revision,
    applicationReads: manifest.applicationReads ?? null,
    manifestPath,
  })}\n`;
}

async function run(options: CliOptions): Promise<void> {
  const startedAt = new Date().toISOString();
  const source = await readBackupFile(options.inputPath);
  let manifest = createManifest(options, source, startedAt);
  await writeManifest(options.manifestPath, options.inputPath, manifest);

  if (!options.execute) {
    manifest = { ...manifest, completedAt: new Date().toISOString() };
    await writeManifest(options.manifestPath, options.inputPath, manifest);
    process.stdout.write(safeSummary(manifest, options.manifestPath));
    return;
  }

  const target = options.target!;
  assertRestoreAllowed({
    target,
    itemsSha256: source.backup.manifest.sha256,
    confirmation: options.confirmation,
  });
  const client = new DynamoDBClient({ region: target.region });
  try {
    await verifyRecoveryTarget(target, client);
    const execution = await new DynamoDbBackupRecoveryRunner(
      createRecoveryPort(target.tableName, client)
    ).restore(source.backup);
    const applicationReads = await verifyApplicationReads(
      source,
      target,
      client
    );
    manifest = {
      ...manifest,
      status: 'completed',
      completedAt: new Date().toISOString(),
      execution,
      applicationReads,
    };
  } catch (error) {
    manifest = {
      ...manifest,
      status: 'failed',
      completedAt: new Date().toISOString(),
      failure: recoveryFailure(error),
    };
    await writeManifest(options.manifestPath, options.inputPath, manifest);
    throw error;
  } finally {
    client.destroy();
  }

  await writeManifest(options.manifestPath, options.inputPath, manifest);
  process.stdout.write(safeSummary(manifest, options.manifestPath));
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid flags';
    console.error(`backup-recovery: ${message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options === null) {
    console.log(USAGE);
    return;
  }
  try {
    await run(options);
  } catch (error) {
    const failure = recoveryFailure(error);
    console.error(`backup-recovery: ${failure.code}: ${failure.message}`);
    process.exitCode = 1;
  }
}

void main();
