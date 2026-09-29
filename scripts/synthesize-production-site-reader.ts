import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createProductionSiteReaderTemplate } from '../infra/production-site-reader';
import { buildReaderLambda } from './build-reader-lambda';

async function main() {
  const argumentsList = process.argv.slice(2).filter(value => value !== '--');
  if (argumentsList.some(value => value !== '--check'))
    throw new Error('Usage: pnpm reader:prod:synth [-- --check]');
  const check = argumentsList.includes('--check');
  await buildReaderLambda({ check });
  const output = resolve(
    'infra/generated/production-site-reader.template.json'
  );
  const serialized = `${JSON.stringify(createProductionSiteReaderTemplate(), null, 2)}\n`;
  if (check) {
    if ((await readFile(output, 'utf8').catch(() => '')) !== serialized)
      throw new Error(
        'Production reader template is stale; run pnpm reader:prod:synth'
      );
  } else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, 'utf8');
  }
  console.log(
    `production site reader: ${check ? 'current' : 'synthesized'} (4 resources)`
  );
}

void main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Reader synthesis failed'
  );
  process.exitCode = 1;
});
