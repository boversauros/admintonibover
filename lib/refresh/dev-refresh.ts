import { createHash } from 'node:crypto';

import type { AttributeValue } from '@aws-sdk/client-dynamodb';

import { EXCLUDED_BACKUP_ENTITY_TYPES } from '@/lib/aws/backup-contract';

// One-way copy of production content into development. Production is only
// ever read; every write goes through a target that passed the direction guard.

export const IMAGE_PREFIX = 'images/';
export const REVISION_KEY = { PK: 'SYSTEM', SK: 'REVISION' } as const;

const BATCH_SIZE = 25;
const COPY_CONCURRENCY = 4;
const SNAPSHOT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 4_000];
const SET_TYPES = new Set(['SS', 'NS', 'BS']);

export type RawItem = Record<string, AttributeValue>;
export type RawKey = { PK: AttributeValue; SK: AttributeValue };
export type WriteRequest = { put: RawItem } | { delete: RawKey };

export type StoredObject = { key: string; etag: string; size: number };

export type EnvironmentResources = {
  environment: string;
  stackName: string;
  accountId: string;
  region: string;
  tableName: string;
  bucketName: string;
};

export interface RefreshTable {
  readonly name: string;
  getRevision(): Promise<number | null>;
  scanAll(): Promise<RawItem[]>;
  /** Returns the requests DynamoDB left unprocessed. */
  batchWrite(requests: WriteRequest[]): Promise<WriteRequest[]>;
}

export interface RefreshBucket {
  readonly name: string;
  list(prefix: string): Promise<StoredObject[]>;
  copyFrom(sourceBucket: string, key: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

export type RefreshSide = { table: RefreshTable; bucket: RefreshBucket };

export type SourceSnapshot = {
  revision: number | null;
  items: RawItem[];
  images: StoredObject[];
};

export type RefreshPlan = {
  sourceRevision: number | null;
  itemPuts: RawItem[];
  itemDeletes: RawKey[];
  unchangedItems: number;
  imageCopies: StoredObject[];
  imageDeletes: string[];
  unchangedImages: number;
  putCounts: Record<string, number>;
  deleteCounts: Record<string, number>;
  missingReferencedImages: string[];
  expectedItems: RawItem[];
  expectedImages: StoredObject[];
  code: string;
};

export class DevRefreshError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DevRefreshError';
  }
}

export function assertRefreshDirection(
  source: EnvironmentResources,
  target: EnvironmentResources
): void {
  const fail = (message: string): never => {
    throw new DevRefreshError('UNSAFE_TARGET', message);
  };
  if (source.environment !== 'prod') {
    fail(`Source stack ${source.stackName} does not output Environment=prod`);
  }
  if (target.environment !== 'dev') {
    fail(`Target stack ${target.stackName} does not output Environment=dev`);
  }
  if (
    source.accountId !== target.accountId ||
    source.region !== target.region
  ) {
    fail('Source and target must share one AWS account and Region');
  }
  if (
    source.tableName === target.tableName ||
    source.bucketName === target.bucketName
  ) {
    fail('Source and target must be different resources');
  }
  for (const name of [target.stackName, target.tableName, target.bucketName]) {
    if (/prod/i.test(name)) fail(`Target ${name} looks like production`);
    if (!/dev/i.test(name)) fail(`Target ${name} does not look like dev`);
  }
}

function stringKey(item: RawItem): string {
  const pk = item.PK?.S;
  const sk = item.SK?.S;
  if (typeof pk !== 'string' || typeof sk !== 'string') {
    throw new DevRefreshError('INVALID_ITEM', 'Item has no string PK/SK');
  }
  return `${pk}\u0000${sk}`;
}

function entityType(item: RawItem): string {
  return item.entityType?.S ?? 'UNKNOWN';
}

function isTransient(item: RawItem): boolean {
  return (EXCLUDED_BACKUP_ENTITY_TYPES as readonly string[]).includes(
    entityType(item)
  );
}

// Lossless, order-independent text form of a raw DynamoDB value.
function canonical(value: unknown, setMembers = false): string {
  if (value instanceof Uint8Array) {
    return JSON.stringify(Buffer.from(value).toString('base64'));
  }
  if (Array.isArray(value)) {
    const members = value.map(member => canonical(member));
    if (setMembers) members.sort();
    return `[${members.join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(
        ([name, member]) =>
          `${JSON.stringify(name)}:${canonical(member, SET_TYPES.has(name))}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function referencedImageKeys(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(IMAGE_PREFIX)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const member of value) referencedImageKeys(member, found);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) {
      referencedImageKeys(member, found);
    }
  }
}

function increment(counts: Record<string, number>, name: string): void {
  counts[name] = (counts[name] ?? 0) + 1;
}

export function buildPlan(input: {
  sourceRevision: number | null;
  sourceItems: RawItem[];
  targetItems: RawItem[];
  sourceImages: StoredObject[];
  targetImages: StoredObject[];
  targetNames: { table: string; bucket: string };
}): RefreshPlan {
  const sourceItems = input.sourceItems.filter(item => !isTransient(item));
  const source = new Map(sourceItems.map(item => [stringKey(item), item]));
  const target = new Map(
    input.targetItems.map(item => [stringKey(item), item])
  );

  const itemPuts: RawItem[] = [];
  const itemDeletes: RawKey[] = [];
  const putCounts: Record<string, number> = {};
  const deleteCounts: Record<string, number> = {};
  const operations: string[] = [];
  let unchangedItems = 0;

  for (const [key, item] of source) {
    const current = target.get(key);
    const hash = digest(canonical(item));
    if (current && digest(canonical(current)) === hash) {
      unchangedItems += 1;
      continue;
    }
    itemPuts.push(item);
    increment(putCounts, entityType(item));
    operations.push(`put ${key} ${hash}`);
  }
  for (const [key, item] of target) {
    if (source.has(key)) continue;
    itemDeletes.push({ PK: item.PK, SK: item.SK });
    increment(deleteCounts, entityType(item));
    operations.push(`delete ${key}`);
  }

  const sourceImages = input.sourceImages.filter(object =>
    object.key.startsWith(IMAGE_PREFIX)
  );
  const targetImages = new Map(
    input.targetImages
      .filter(object => object.key.startsWith(IMAGE_PREFIX))
      .map(object => [object.key, object])
  );
  const sourceImageKeys = new Set(sourceImages.map(object => object.key));
  const imageCopies: StoredObject[] = [];
  let unchangedImages = 0;
  for (const object of sourceImages) {
    const current = targetImages.get(object.key);
    if (
      current &&
      current.etag === object.etag &&
      current.size === object.size
    ) {
      unchangedImages += 1;
      continue;
    }
    imageCopies.push(object);
    operations.push(`copy ${object.key} ${object.etag} ${object.size}`);
  }
  const imageDeletes = [...targetImages.keys()].filter(
    key => !sourceImageKeys.has(key)
  );
  for (const key of imageDeletes) operations.push(`remove ${key}`);

  const referenced = new Set<string>();
  referencedImageKeys(sourceItems, referenced);
  const missingReferencedImages = [...referenced]
    .filter(key => !sourceImageKeys.has(key))
    .sort();

  operations.sort();
  const code = digest(
    [
      `revision ${input.sourceRevision ?? 'none'}`,
      `target ${input.targetNames.table} ${input.targetNames.bucket}`,
      ...operations,
    ].join('\n')
  ).slice(0, 10);

  return {
    sourceRevision: input.sourceRevision,
    itemPuts,
    itemDeletes,
    unchangedItems,
    imageCopies,
    imageDeletes,
    unchangedImages,
    putCounts,
    deleteCounts,
    missingReferencedImages,
    expectedItems: sourceItems,
    expectedImages: sourceImages,
    code,
  };
}

export function planIsEmpty(plan: RefreshPlan): boolean {
  return (
    plan.itemPuts.length === 0 &&
    plan.itemDeletes.length === 0 &&
    plan.imageCopies.length === 0 &&
    plan.imageDeletes.length === 0
  );
}

// Mirrors the protected backup: the revision must not move during the scan,
// so the copy never contains a half-written post.
export async function readSourceSnapshot(
  source: RefreshSide,
  attempts = SNAPSHOT_ATTEMPTS
): Promise<SourceSnapshot> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = await source.table.getRevision();
    const items = await source.table.scanAll();
    const after = await source.table.getRevision();
    if (before === after) {
      // Listed after the consistent scan so referenced images already exist.
      const images = await source.bucket.list(IMAGE_PREFIX);
      return {
        revision: before,
        items: items.filter(item => !isTransient(item)),
        images,
      };
    }
  }
  throw new DevRefreshError(
    'SOURCE_BUSY',
    'Production content kept changing during the read; try again in a minute'
  );
}

export async function readTargetState(
  target: RefreshSide
): Promise<{ items: RawItem[]; images: StoredObject[] }> {
  const [items, images] = await Promise.all([
    target.table.scanAll(),
    target.bucket.list(IMAGE_PREFIX),
  ]);
  return { items, images };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function writeAll(
  table: RefreshTable,
  requests: WriteRequest[],
  sleep: (milliseconds: number) => Promise<void>,
  retryDelaysMs: number[]
): Promise<void> {
  for (const batch of chunks(requests, BATCH_SIZE)) {
    let pending = await table.batchWrite(batch);
    for (const delay of retryDelaysMs) {
      if (pending.length === 0) break;
      await sleep(delay);
      pending = await table.batchWrite(pending);
    }
    if (pending.length > 0) {
      throw new DevRefreshError(
        'WRITE_INCOMPLETE',
        `${pending.length} dev items stayed unprocessed after retries; run the refresh again`
      );
    }
  }
}

export type ApplyOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  retryDelaysMs?: number[];
  log?: (message: string) => void;
};

export async function applyPlan(
  plan: RefreshPlan,
  sourceBucketName: string,
  target: RefreshSide,
  options: ApplyOptions = {}
): Promise<void> {
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const log = options.log ?? (() => {});

  // Images first so new items never point at a missing object.
  let copied = 0;
  for (const batch of chunks(plan.imageCopies, COPY_CONCURRENCY)) {
    await Promise.all(
      batch.map(object => target.bucket.copyFrom(sourceBucketName, object.key))
    );
    copied += batch.length;
    log(`  images copied: ${copied}/${plan.imageCopies.length}`);
  }

  // The revision marker goes last so a dev site build never sees it settle early.
  const puts = [...plan.itemPuts].sort(
    (a, b) =>
      Number(entityType(a) === 'DATA_REVISION') -
      Number(entityType(b) === 'DATA_REVISION')
  );
  await writeAll(
    target.table,
    puts.map(item => ({ put: item })),
    sleep,
    retryDelaysMs
  );
  log(`  items written: ${puts.length}`);
  await writeAll(
    target.table,
    plan.itemDeletes.map(key => ({ delete: key })),
    sleep,
    retryDelaysMs
  );
  log(`  items deleted: ${plan.itemDeletes.length}`);

  if (plan.imageDeletes.length > 0) {
    await target.bucket.delete(plan.imageDeletes);
  }
  log(`  images deleted: ${plan.imageDeletes.length}`);
}

export async function verifyTarget(
  plan: RefreshPlan,
  target: RefreshSide
): Promise<void> {
  const state = await readTargetState(target);
  const remaining = buildPlan({
    sourceRevision: plan.sourceRevision,
    sourceItems: plan.expectedItems,
    targetItems: state.items,
    sourceImages: plan.expectedImages,
    targetImages: state.images,
    targetNames: { table: target.table.name, bucket: target.bucket.name },
  });
  if (!planIsEmpty(remaining)) {
    throw new DevRefreshError(
      'VERIFY_FAILED',
      `Dev still differs from the snapshot: ${remaining.itemPuts.length} items to write, ${remaining.itemDeletes.length} to delete, ${remaining.imageCopies.length} images to copy, ${remaining.imageDeletes.length} to delete`
    );
  }
}
