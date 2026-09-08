import { resolve } from 'node:path';

import { validateAndProjectBackupFile } from '../lib/migration/backup-validator';
import {
  JsonDynamoDbMigrationRunner,
  assertExecuteAllowed,
  assertRollbackAllowed,
  createMigrationPlan,
  createRunManifest,
  createVerifiedMigrationPort,
  safeFailure,
  writeRunManifest,
  type MigrationRunManifest,
  type MigrationTarget,
} from '../lib/migration/json-dynamodb';

const USAGE = `Usage:
  pnpm migration:run -- --input <absolute-path> --input-sha256 <sha256> --manifest <path> [--expect-known-baseline]
  pnpm migration:run -- --execute --input <absolute-path> --input-sha256 <sha256> --manifest <path> --environment <dev|prod> --account-id <12-digits> --region <region> --table <name> --confirmation <typed-value> [--concurrency <1-8>]
  pnpm migration:run -- --rollback-run-id <run-id> --input <absolute-path> --input-sha256 <sha256> --manifest <path> --environment <dev|prod> --account-id <12-digits> --region <region> --table <name> --confirmation <typed-value> [--concurrency <1-8>]

Dry run is the default and never creates an AWS client. Production-looking targets also require --allow-production and --production-confirmation.`;

type CliMode = 'dry-run' | 'execute' | 'rollback';

type CliOptions = {
  mode: CliMode;
  inputPath: string;
  expectedSha256: string;
  manifestPath: string;
  expectKnownBaseline: boolean;
  target: MigrationTarget | null;
  confirmation?: string;
  allowProduction: boolean;
  productionConfirmation?: string;
  rollbackRunId?: string;
  concurrency: number;
};

const VALUE_FLAGS = new Set([
  '--input',
  '--input-sha256',
  '--manifest',
  '--environment',
  '--account-id',
  '--region',
  '--table',
  '--confirmation',
  '--production-confirmation',
  '--rollback-run-id',
  '--concurrency',
]);

function valueAfter(
  argumentsList: string[],
  index: number,
  flag: string
): string {
  const value = argumentsList[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function targetFrom(input: {
  environment?: string;
  accountId?: string;
  region?: string;
  tableName?: string;
}): MigrationTarget | null {
  const values = [
    input.environment,
    input.accountId,
    input.region,
    input.tableName,
  ];
  if (values.every(value => value === undefined)) return null;
  if (values.some(value => value === undefined)) {
    throw new Error(
      '--environment, --account-id, --region, and --table must be supplied together'
    );
  }
  if (input.environment !== 'dev' && input.environment !== 'prod') {
    throw new Error('--environment must be dev or prod');
  }
  return {
    environment: input.environment,
    accountId: input.accountId!,
    region: input.region!,
    tableName: input.tableName!,
  };
}

function parseArguments(argumentsList: string[]): CliOptions | null {
  let inputPath: string | undefined;
  let expectedSha256: string | undefined;
  let manifestPath: string | undefined;
  let environment: string | undefined;
  let accountId: string | undefined;
  let region: string | undefined;
  let tableName: string | undefined;
  let confirmation: string | undefined;
  let productionConfirmation: string | undefined;
  let rollbackRunId: string | undefined;
  let execute = false;
  let dryRun = false;
  let allowProduction = false;
  let expectKnownBaseline = false;
  let concurrency = 2;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--execute') {
      execute = true;
      continue;
    }
    if (argument === '--allow-production') {
      allowProduction = true;
      continue;
    }
    if (argument === '--expect-known-baseline') {
      expectKnownBaseline = true;
      continue;
    }
    if (!VALUE_FLAGS.has(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = valueAfter(argumentsList, index, argument);
    index += 1;
    switch (argument) {
      case '--input':
        inputPath = value;
        break;
      case '--input-sha256':
        expectedSha256 = value.toLowerCase();
        break;
      case '--manifest':
        manifestPath = value;
        break;
      case '--environment':
        environment = value;
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
      case '--production-confirmation':
        productionConfirmation = value;
        break;
      case '--rollback-run-id':
        rollbackRunId = value;
        break;
      case '--concurrency':
        concurrency = Number(value);
        break;
    }
  }

  if (dryRun && (execute || rollbackRunId !== undefined)) {
    throw new Error('--dry-run cannot be combined with a write mode');
  }
  if (execute && rollbackRunId !== undefined) {
    throw new Error('--execute cannot be combined with --rollback-run-id');
  }
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8
  ) {
    throw new Error('--concurrency must be an integer between 1 and 8');
  }

  const mode: CliMode = rollbackRunId
    ? 'rollback'
    : execute
      ? 'execute'
      : 'dry-run';
  const target = targetFrom({ environment, accountId, region, tableName });
  if (mode !== 'dry-run' && target === null) {
    throw new Error('Write and rollback modes require an explicit AWS target');
  }

  return {
    mode,
    inputPath: resolve(required(inputPath, '--input')),
    expectedSha256: required(expectedSha256, '--input-sha256'),
    manifestPath: resolve(required(manifestPath, '--manifest')),
    expectKnownBaseline,
    target,
    ...(confirmation === undefined ? {} : { confirmation }),
    allowProduction,
    ...(productionConfirmation === undefined ? {} : { productionConfirmation }),
    ...(rollbackRunId === undefined ? {} : { rollbackRunId }),
    concurrency,
  };
}

function safeSummary(
  manifest: MigrationRunManifest,
  manifestPath: string
): string {
  return `${JSON.stringify({
    status: manifest.status,
    mode: manifest.mode,
    runId: manifest.runId,
    projectedPosts: manifest.transformedCounts.POST,
    warningCount: manifest.warnings.length,
    manifestPath,
  })}\n`;
}

async function run(options: CliOptions): Promise<void> {
  const projection = await validateAndProjectBackupFile(options.inputPath, {
    expectedSha256: options.expectedSha256,
    expectKnownBaseline: options.expectKnownBaseline,
  });
  const plan = createMigrationPlan(projection, options.target);
  let manifest = createRunManifest({
    plan,
    mode: options.mode,
    status: 'planned',
    timestamp: new Date().toISOString(),
  });

  if (options.mode === 'dry-run') {
    manifest = { ...manifest, status: 'dry-run' };
    await writeRunManifest(options.manifestPath, options.inputPath, manifest);
    process.stdout.write(safeSummary(manifest, options.manifestPath));
    return;
  }

  const target = options.target!;
  if (options.mode === 'execute') {
    assertExecuteAllowed({
      target,
      sourceSha256: plan.source.sha256,
      confirmation: options.confirmation,
      allowProduction: options.allowProduction,
      productionConfirmation: options.productionConfirmation,
    });
  } else {
    if (options.rollbackRunId !== plan.runId) {
      throw new Error('Rollback run ID does not match this input and target');
    }
    assertRollbackAllowed({
      target,
      runId: plan.runId,
      sourceSha256: plan.source.sha256,
      confirmation: options.confirmation,
      allowProduction: options.allowProduction,
      productionConfirmation: options.productionConfirmation,
    });
  }

  await writeRunManifest(options.manifestPath, options.inputPath, manifest);
  try {
    const port = await createVerifiedMigrationPort(target);
    const runner = new JsonDynamoDbMigrationRunner(port, {
      concurrency: options.concurrency,
    });
    if (options.mode === 'execute') {
      const execution = await runner.execute(plan);
      manifest = {
        ...manifest,
        status: 'completed',
        execution,
        verification: execution.verification,
      };
    } else {
      const rollback = await runner.rollback(plan);
      manifest = { ...manifest, status: 'rolled-back', rollback };
    }
  } catch (error) {
    manifest = { ...manifest, status: 'failed', failure: safeFailure(error) };
    await writeRunManifest(options.manifestPath, options.inputPath, manifest);
    throw error;
  }

  await writeRunManifest(options.manifestPath, options.inputPath, manifest);
  process.stdout.write(safeSummary(manifest, options.manifestPath));
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid arguments';
    console.error(`json-dynamodb-migrator: ${message}\n\n${USAGE}`);
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
    const failure = safeFailure(error);
    console.error(
      `json-dynamodb-migrator: ${failure.code}: ${failure.message}`
    );
    process.exitCode = 1;
  }
}

void main();
