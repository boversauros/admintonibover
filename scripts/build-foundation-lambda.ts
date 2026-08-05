import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const ENTRY_PATH = resolve('infra/lambda/foundation.ts');
export const FOUNDATION_LAMBDA_OUTPUT = resolve(
  'infra/generated/foundation-lambda.cjs'
);
const MAX_INLINE_BUNDLE_BYTES = 900_000;

export async function buildFoundationLambda({
  check,
}: {
  check: boolean;
}): Promise<{ bytes: number }> {
  const result = await build({
    entryPoints: [ENTRY_PATH],
    bundle: true,
    format: 'cjs',
    minify: true,
    platform: 'node',
    target: 'node24',
    tsconfig: resolve('tsconfig.json'),
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const bundledOutput = result.outputFiles[0]?.text;
  if (!bundledOutput) {
    throw new Error('Lambda bundling produced no JavaScript output');
  }
  // Some AWS SDK diagnostics contain spaces immediately before a newline.
  // Normalize them so the committed generated artifact stays diff-check clean.
  const output = bundledOutput.replace(/[ \t]+$/gm, '');
  const bytes = Buffer.byteLength(output, 'utf8');
  if (bytes > MAX_INLINE_BUNDLE_BYTES) {
    throw new Error(
      `Lambda bundle is ${bytes} bytes; inline limit is ${MAX_INLINE_BUNDLE_BYTES}`
    );
  }

  if (check) {
    let committed: string;
    try {
      committed = await readFile(FOUNDATION_LAMBDA_OUTPUT, 'utf8');
    } catch {
      throw new Error(
        `Lambda bundle is missing at ${FOUNDATION_LAMBDA_OUTPUT}; run pnpm lambda:build`
      );
    }
    if (committed !== output) {
      throw new Error(
        `Lambda bundle is stale at ${FOUNDATION_LAMBDA_OUTPUT}; run pnpm lambda:build`
      );
    }
    return { bytes };
  }

  await mkdir(dirname(FOUNDATION_LAMBDA_OUTPUT), { recursive: true });
  await writeFile(FOUNDATION_LAMBDA_OUTPUT, output, 'utf8');
  return { bytes };
}

async function main(): Promise<void> {
  const check = process.argv.slice(2).includes('--check');
  const result = await buildFoundationLambda({ check });
  console.log(
    `lambda: ${check ? 'valid, current bundle' : 'built bundle'} (${result.bytes} bytes)`
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  void main().catch(error => {
    console.error(
      `lambda: ${error instanceof Error ? error.message : 'bundle failed'}`
    );
    process.exitCode = 1;
  });
}
