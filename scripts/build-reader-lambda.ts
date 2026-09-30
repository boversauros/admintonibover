import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { build } from 'esbuild';

const OUTPUT = resolve('infra/generated/build-reader-lambda.cjs');
const ZIP_OUTPUT = resolve('infra/generated/build-reader-lambda.zip');

function zipEntry(content: Buffer): Buffer {
  const name = Buffer.from('index.js', 'utf8');
  const compressed = deflateRawSync(content, { level: 9 });
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

export async function buildReaderLambda({
  check,
}: {
  check: boolean;
}): Promise<{ bytes: number; key: string }> {
  const result = await build({
    entryPoints: [resolve('infra/lambda/build-reader.ts')],
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
  const output = result.outputFiles[0]?.text.replace(/[ \t]+$/gm, '');
  if (!output) throw new Error('Reader Lambda bundling failed');
  const bytes = Buffer.byteLength(output, 'utf8');
  const archive = zipEntry(Buffer.from(output, 'utf8'));
  const key = `deployment/build-reader/${createHash('sha256').update(archive).digest('hex')}.zip`;
  if (check) {
    if ((await readFile(OUTPUT, 'utf8').catch(() => '')) !== output) {
      throw new Error(
        'Reader Lambda bundle is missing or stale; run pnpm reader:build'
      );
    }
    if (
      !(await readFile(ZIP_OUTPUT).catch(() => Buffer.alloc(0))).equals(archive)
    ) {
      throw new Error(
        'Reader Lambda zip is missing or stale; run pnpm reader:build'
      );
    }
  } else {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, output, 'utf8');
    await writeFile(ZIP_OUTPUT, archive);
  }
  return { bytes, key };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  void buildReaderLambda({ check: process.argv.includes('--check') })
    .then(({ bytes, key }) => {
      console.log(`reader Lambda: ${bytes} bytes; upload zip to ${key}`);
    })
    .catch(error => {
      console.error(
        error instanceof Error ? error.message : 'Reader bundle failed'
      );
      process.exitCode = 1;
    });
}
