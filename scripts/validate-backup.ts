import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

import {
  serializeValidationReport,
  validateBackupFile,
} from '../lib/migration/backup-validator';

type CliOptions = {
  inputPath: string;
  reportPath?: string;
  expectKnownBaseline: boolean;
};

const USAGE = `Usage:
  pnpm backup:validate -- --input <backup.json> [--report <report.json>] [--expect-known-baseline]

Options:
  -i, --input                   User-supplied Supabase JSON backup path
  -r, --report                  Write the deterministic JSON report to this path
      --expect-known-baseline   Require the documented June 2026 counts/anomaly
  -h, --help                    Show this help

The command reads the source twice to prove its SHA-256 and modification time
remain unchanged. It makes no Supabase, AWS, S3, or other network request.`;

function requireNextArgument(
  argumentsList: string[],
  index: number,
  flag: string
): string {
  const value = argumentsList[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${flag} requires a path`);
  }
  return value;
}

function parseArguments(argumentsList: string[]): CliOptions | null {
  let inputPath: string | undefined;
  let reportPath: string | undefined;
  let expectKnownBaseline = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--input' || argument === '-i') {
      inputPath = requireNextArgument(argumentsList, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--report' || argument === '-r') {
      reportPath = requireNextArgument(argumentsList, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--expect-known-baseline') {
      expectKnownBaseline = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (inputPath === undefined) {
    throw new Error('--input is required');
  }

  const resolvedInput = resolve(inputPath);
  const resolvedReport =
    reportPath === undefined ? undefined : resolve(reportPath);
  if (resolvedReport === resolvedInput) {
    throw new Error('Report path must not overwrite the source backup');
  }

  return {
    inputPath: resolvedInput,
    reportPath: resolvedReport,
    expectKnownBaseline,
  };
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid arguments';
    console.error(`backup-validator: ${message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  if (options === null) {
    console.log(USAGE);
    return;
  }

  try {
    const report = await validateBackupFile(options.inputPath, {
      expectKnownBaseline: options.expectKnownBaseline,
    });
    const json = serializeValidationReport(report);

    if (options.reportPath === undefined) {
      process.stdout.write(json);
    } else {
      await writeFile(options.reportPath, json, {
        encoding: 'utf8',
        flag: 'w',
      });
      console.error(
        `backup-validator: report written to ${options.reportPath}`
      );
    }

    if (!report.valid) process.exitCode = 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Validation failed';
    console.error(`backup-validator: ${message}`);
    process.exitCode = 2;
  }
}

void main();
