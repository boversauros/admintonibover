import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildFoundationLambda } from './build-foundation-lambda';

const DEFAULT_OUTPUT = resolve('infra/generated/dev-foundation.template.json');

type CliOptions = {
  check: boolean;
  outputPath: string;
};

const USAGE = `Usage:
  pnpm infra:synth [-- --output <template.json>]
  pnpm infra:validate

Options:
  -o, --output <path>  Write the synthesized CloudFormation JSON to this path
      --check          Validate and confirm the committed synthesis is current
  -h, --help           Show this help

Synthesis and validation are deterministic, offline, and use no AWS credentials.`;

function parseArguments(argumentsList: string[]): CliOptions | null {
  let check = false;
  let outputPath = DEFAULT_OUTPUT;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--check') {
      check = true;
      continue;
    }
    if (argument === '--output' || argument === '-o') {
      const value = argumentsList[index + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${argument} requires a path`);
      }
      outputPath = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { check, outputPath };
}

async function main(): Promise<void> {
  let options: CliOptions | null;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid arguments';
    console.error(`infra: ${message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  if (options === null) {
    console.log(USAGE);
    return;
  }

  const lambda = await buildFoundationLambda({ check: options.check });
  const [{ createDevFoundationTemplate }, { validateDevFoundationTemplate }] =
    await Promise.all([
      import('../infra/dev-foundation'),
      import('../infra/validate-dev-foundation'),
    ]);
  const template = createDevFoundationTemplate();
  const summary = validateDevFoundationTemplate(template);
  const serialized = `${JSON.stringify(template, null, 2)}\n`;

  if (options.check) {
    let committed: string;
    try {
      committed = await readFile(options.outputPath, 'utf8');
    } catch {
      throw new Error(
        `Synthesized template is missing at ${options.outputPath}; run pnpm infra:synth`
      );
    }
    if (committed !== serialized) {
      throw new Error(
        `Synthesized template is stale at ${options.outputPath}; run pnpm infra:synth`
      );
    }
    console.log(
      `infra: valid, current synthesis (${summary.resourceCount} resources, ${lambda.bytes} byte Lambda bundle)`
    );
    return;
  }

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, serialized, {
    encoding: 'utf8',
    flag: 'w',
  });
  console.log(
    `infra: synthesized ${summary.resourceCount} resources with a ${lambda.bytes} byte Lambda bundle to ${options.outputPath}`
  );
}

void main().catch(error => {
  const message =
    error instanceof Error ? error.message : 'Infrastructure synthesis failed';
  console.error(`infra: ${message}`);
  process.exitCode = 1;
});
