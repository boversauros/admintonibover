import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildFoundationLambda } from './build-foundation-lambda';

const DEFAULT_OUTPUTS = {
  dev: resolve('infra/generated/dev-foundation.template.json'),
  prod: resolve('infra/generated/prod-foundation.template.json'),
} as const;

type FoundationEnvironment = keyof typeof DEFAULT_OUTPUTS;
type EnvironmentSelection = FoundationEnvironment | 'all';

type CliOptions = {
  check: boolean;
  environment: EnvironmentSelection;
  outputPath: string | null;
};

const USAGE = `Usage:
  pnpm infra:synth [-- --environment <dev|prod>] [--output <template.json>]
  pnpm infra:validate

Options:
  -e, --environment   Synthesize dev or prod; --check defaults to both
  -o, --output <path>  Write the synthesized CloudFormation JSON to this path
      --check          Validate and confirm the committed synthesis is current
  -h, --help           Show this help

Synthesis and validation are deterministic, offline, and use no AWS credentials.`;

function parseArguments(argumentsList: string[]): CliOptions | null {
  let check = false;
  let environment: EnvironmentSelection = 'dev';
  let environmentWasSpecified = false;
  let outputPath: string | null = null;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') return null;
    if (argument === '--check') {
      check = true;
      continue;
    }
    if (argument === '--environment' || argument === '-e') {
      const value = argumentsList[index + 1];
      if (value !== 'dev' && value !== 'prod' && value !== 'all') {
        throw new Error(`${argument} must be dev, prod, or all`);
      }
      environment = value;
      environmentWasSpecified = true;
      index += 1;
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

  if (check && !environmentWasSpecified) environment = 'all';
  if (!check && environment === 'all') {
    throw new Error('--environment all requires --check');
  }
  if (environment === 'all' && outputPath !== null) {
    throw new Error('--output cannot be combined with --environment all');
  }

  return { check, environment, outputPath };
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
  const [{ createFoundationTemplate }, { validateFoundationTemplate }] =
    await Promise.all([
      import('../infra/dev-foundation'),
      import('../infra/validate-dev-foundation'),
    ]);
  const environments: FoundationEnvironment[] =
    options.environment === 'all' ? ['dev', 'prod'] : [options.environment];

  for (const environment of environments) {
    const outputPath = options.outputPath ?? DEFAULT_OUTPUTS[environment];
    const template = createFoundationTemplate(environment);
    const summary = validateFoundationTemplate(template, environment);
    const serialized = `${JSON.stringify(template, null, 2)}\n`;

    if (options.check) {
      let committed: string;
      try {
        committed = await readFile(outputPath, 'utf8');
      } catch {
        throw new Error(
          `Synthesized ${environment} template is missing at ${outputPath}; run pnpm infra:synth -- --environment ${environment}`
        );
      }
      if (committed !== serialized) {
        throw new Error(
          `Synthesized ${environment} template is stale at ${outputPath}; run pnpm infra:synth -- --environment ${environment}`
        );
      }
      console.log(
        `infra: ${environment} valid, current synthesis (${summary.resourceCount} resources, ${lambda.bytes} byte Lambda bundle)`
      );
      continue;
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, {
      encoding: 'utf8',
      flag: 'w',
    });
    console.log(
      `infra: synthesized ${environment} ${summary.resourceCount} resources with a ${lambda.bytes} byte Lambda bundle to ${outputPath}`
    );
  }
}

void main().catch(error => {
  const message =
    error instanceof Error ? error.message : 'Infrastructure synthesis failed';
  console.error(`infra: ${message}`);
  process.exitCode = 1;
});
