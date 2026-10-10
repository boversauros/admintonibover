import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AwsRefreshBucket,
  AwsRefreshTable,
  describeEnvironment,
} from '../lib/refresh/aws-refresh';
import {
  DevRefreshError,
  applyPlan,
  assertRefreshDirection,
  buildPlan,
  planIsEmpty,
  readSourceSnapshot,
  readTargetState,
  verifyTarget,
  type EnvironmentResources,
  type RawItem,
  type RefreshBucket,
  type RefreshSide,
  type RefreshTable,
  type StoredObject,
  type WriteRequest,
} from '../lib/refresh/dev-refresh';

const PROD: EnvironmentResources = {
  environment: 'prod',
  stackName: 'admintonibover-prod',
  accountId: '111122223333',
  region: 'eu-west-1',
  tableName: 'admintonibover-prod-ContentTable-AAA',
  bucketName: 'admintonibover-prod-contentbucket-aaa',
};

const DEV: EnvironmentResources = {
  environment: 'dev',
  stackName: 'admintonibover-dev',
  accountId: '111122223333',
  region: 'eu-west-1',
  tableName: 'admintonibover-dev-ContentTable-BBB',
  bucketName: 'admintonibover-dev-contentbucket-bbb',
};

function item(
  pk: string,
  sk: string,
  entityType: string,
  extra: RawItem = {}
): RawItem {
  return {
    PK: { S: pk },
    SK: { S: sk },
    entityType: { S: entityType },
    ...extra,
  };
}

function revisionItem(revision: number): RawItem {
  return item('SYSTEM', 'REVISION', 'DATA_REVISION', {
    revision: { N: String(revision) },
  });
}

const keyOf = (value: RawItem | { PK: { S?: string }; SK: { S?: string } }) =>
  `${value.PK.S}|${value.SK.S}`;

class FakeTable implements RefreshTable {
  readonly items = new Map<string, RawItem>();
  writes = 0;
  unprocessedOnce = 0;
  revisions: (number | null)[] | null = null;

  constructor(
    readonly name: string,
    readonly writable: boolean,
    initial: RawItem[] = []
  ) {
    for (const value of initial) this.items.set(keyOf(value), value);
  }

  async getRevision(): Promise<number | null> {
    if (this.revisions) return this.revisions.shift() ?? null;
    const value = this.items.get('SYSTEM|REVISION')?.revision?.N;
    return value === undefined ? null : Number(value);
  }

  async scanAll(): Promise<RawItem[]> {
    return [...this.items.values()].map(value => structuredClone(value));
  }

  async batchWrite(requests: WriteRequest[]): Promise<WriteRequest[]> {
    if (!this.writable) throw new Error(`write to source ${this.name}`);
    assert.ok(requests.length <= 25, 'batch must not exceed 25');
    this.writes += 1;
    const deferred = requests.slice(0, this.unprocessedOnce);
    this.unprocessedOnce = 0;
    for (const request of requests.slice(deferred.length)) {
      if ('put' in request) this.items.set(keyOf(request.put), request.put);
      else this.items.delete(keyOf(request.delete));
    }
    return deferred;
  }
}

class FakeBucket implements RefreshBucket {
  readonly objects = new Map<string, StoredObject>();

  constructor(
    readonly name: string,
    readonly writable: boolean,
    initial: StoredObject[] = [],
    private readonly peers: Map<string, FakeBucket> = new Map()
  ) {
    for (const object of initial) this.objects.set(object.key, object);
    peers.set(name, this);
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.objects.values()].filter(object =>
      object.key.startsWith(prefix)
    );
  }

  async copyFrom(sourceBucket: string, key: string): Promise<void> {
    if (!this.writable) throw new Error(`copy into source ${this.name}`);
    const source = this.peers.get(sourceBucket)?.objects.get(key);
    assert.ok(source, `missing source object ${key}`);
    this.objects.set(key, { ...source });
  }

  async delete(keys: string[]): Promise<void> {
    if (!this.writable) throw new Error(`delete in source ${this.name}`);
    for (const key of keys) this.objects.delete(key);
  }
}

function environments(input: {
  prodItems: RawItem[];
  devItems: RawItem[];
  prodImages?: StoredObject[];
  devImages?: StoredObject[];
}) {
  const peers = new Map<string, FakeBucket>();
  const prodTable = new FakeTable(PROD.tableName, false, input.prodItems);
  const devTable = new FakeTable(DEV.tableName, true, input.devItems);
  const prodBucket = new FakeBucket(
    PROD.bucketName,
    false,
    input.prodImages,
    peers
  );
  const devBucket = new FakeBucket(
    DEV.bucketName,
    true,
    input.devImages,
    peers
  );
  const prod: RefreshSide = { table: prodTable, bucket: prodBucket };
  const dev: RefreshSide = { table: devTable, bucket: devBucket };
  return { prod, dev, prodTable, devTable, prodBucket, devBucket };
}

async function plan(prod: RefreshSide, dev: RefreshSide) {
  const snapshot = await readSourceSnapshot(prod);
  const state = await readTargetState(dev);
  return buildPlan({
    sourceRevision: snapshot.revision,
    sourceItems: snapshot.items,
    targetItems: state.items,
    sourceImages: snapshot.images,
    targetImages: state.images,
    targetNames: { table: dev.table.name, bucket: dev.bucket.name },
  });
}

const image = (key: string, etag: string, size = 10): StoredObject => ({
  key,
  etag,
  size,
});

test('direction guard accepts prod to dev and refuses every unsafe target', () => {
  assert.doesNotThrow(() => assertRefreshDirection(PROD, DEV));
  const refuses = (
    source: EnvironmentResources,
    target: EnvironmentResources
  ) =>
    assert.throws(
      () => assertRefreshDirection(source, target),
      (error: unknown) =>
        error instanceof DevRefreshError && error.code === 'UNSAFE_TARGET'
    );
  refuses(DEV, PROD);
  refuses(PROD, PROD);
  refuses(PROD, { ...DEV, tableName: PROD.tableName });
  refuses(PROD, { ...DEV, bucketName: 'admintonibover-prod-copy-dev' });
  refuses(PROD, { ...DEV, tableName: 'admintonibover-staging-table' });
  refuses(PROD, { ...DEV, accountId: '999988887777' });
  refuses(PROD, { ...DEV, region: 'eu-central-1' });
  refuses({ ...PROD, environment: 'dev' }, DEV);
});

test('plan writes new and changed items, deletes dev-only and transient items', async () => {
  const { prod, dev } = environments({
    prodItems: [
      revisionItem(7),
      item('POST#1', 'POST#1', 'POST', { title: { S: 'Prod title' } }),
      item('POST#2', 'POST#2', 'POST', { title: { S: 'Same' } }),
      item('IDEMPOTENCY#x', 'IDEMPOTENCY', 'IDEMPOTENCY'),
    ],
    devItems: [
      revisionItem(3),
      item('POST#1', 'POST#1', 'POST', { title: { S: 'Dev edit' } }),
      item('POST#2', 'POST#2', 'POST', { title: { S: 'Same' } }),
      item('POST#9', 'POST#9', 'POST'),
      item('UPLOAD#y', 'UPLOAD', 'MEDIA_UPLOAD'),
    ],
  });
  const result = await plan(prod, dev);
  assert.equal(result.sourceRevision, 7);
  assert.deepEqual(result.itemPuts.map(keyOf).sort(), [
    'POST#1|POST#1',
    'SYSTEM|REVISION',
  ]);
  assert.deepEqual(result.itemDeletes.map(keyOf).sort(), [
    'POST#9|POST#9',
    'UPLOAD#y|UPLOAD',
  ]);
  assert.equal(result.unchangedItems, 1);
  assert.deepEqual(result.putCounts, { DATA_REVISION: 1, POST: 1 });
  assert.deepEqual(result.deleteCounts, { MEDIA_UPLOAD: 1, POST: 1 });
  assert.equal(
    result.expectedItems.some(value => value.entityType.S === 'IDEMPOTENCY'),
    false
  );
});

test('item comparison is exact for numbers and ignores set member order', () => {
  const base = { sourceRevision: 1, sourceImages: [], targetImages: [] };
  const names = { table: DEV.tableName, bucket: DEV.bucketName };
  const sets = buildPlan({
    ...base,
    targetNames: names,
    sourceItems: [item('K#1', 'K#1', 'KEYWORD', { tags: { SS: ['a', 'b'] } })],
    targetItems: [item('K#1', 'K#1', 'KEYWORD', { tags: { SS: ['b', 'a'] } })],
  });
  assert.equal(planIsEmpty(sets), true);

  const changedSet = buildPlan({
    ...base,
    targetNames: names,
    sourceItems: [item('K#1', 'K#1', 'KEYWORD', { tags: { SS: ['a', 'c'] } })],
    targetItems: [item('K#1', 'K#1', 'KEYWORD', { tags: { SS: ['a', 'b'] } })],
  });
  assert.equal(changedSet.itemPuts.length, 1);

  const numbers = buildPlan({
    ...base,
    targetNames: names,
    sourceItems: [
      item('P#1', 'P#1', 'POST', { version: { N: '9007199254740993' } }),
    ],
    targetItems: [
      item('P#1', 'P#1', 'POST', { version: { N: '9007199254740992' } }),
    ],
  });
  assert.equal(numbers.itemPuts.length, 1);
});

test('plan copies new or changed images and removes dev-only images under images/', async () => {
  const { prod, dev } = environments({
    prodItems: [
      revisionItem(1),
      item('POST#1', 'POST#1', 'POST', {
        image: { M: { key: { S: 'images/posts/1/cover/new.webp' } } },
        thumb: { S: 'images/posts/1/thumb/lost.webp' },
      }),
    ],
    devItems: [],
    prodImages: [
      image('images/posts/1/cover/new.webp', '"a"'),
      image('images/posts/2/cover/same.webp', '"s"'),
      image('images/posts/3/cover/changed.webp', '"new"'),
    ],
    devImages: [
      image('images/posts/2/cover/same.webp', '"s"'),
      image('images/posts/3/cover/changed.webp', '"old"'),
      image('images/posts/8/cover/dev-only.webp', '"d"'),
      image('temporary/upload-in-progress', '"t"'),
    ],
  });
  const result = await plan(prod, dev);
  assert.deepEqual(result.imageCopies.map(object => object.key).sort(), [
    'images/posts/1/cover/new.webp',
    'images/posts/3/cover/changed.webp',
  ]);
  assert.deepEqual(result.imageDeletes, ['images/posts/8/cover/dev-only.webp']);
  assert.equal(result.unchangedImages, 1);
  assert.deepEqual(result.missingReferencedImages, [
    'images/posts/1/thumb/lost.webp',
  ]);
});

test('confirmation code is stable for the same state and changes when prod changes', async () => {
  const setup = () =>
    environments({
      prodItems: [revisionItem(4), item('POST#1', 'POST#1', 'POST')],
      devItems: [],
    });
  const first = setup();
  const second = setup();
  const a = await plan(first.prod, first.dev);
  const b = await plan(second.prod, second.dev);
  assert.match(a.code, /^[0-9a-f]{10}$/);
  assert.equal(a.code, b.code);

  second.prodTable.items.set('POST#2|POST#2', item('POST#2', 'POST#2', 'POST'));
  second.prodTable.items.set('SYSTEM|REVISION', revisionItem(5));
  const changed = await plan(second.prod, second.dev);
  assert.notEqual(changed.code, a.code);
});

test('snapshot retries while the prod revision moves and gives up after three tries', async () => {
  const moving = environments({
    prodItems: [revisionItem(1)],
    devItems: [],
  });
  moving.prodTable.revisions = [1, 2, 2, 2];
  const snapshot = await readSourceSnapshot(moving.prod);
  assert.equal(snapshot.revision, 2);

  const busy = environments({ prodItems: [revisionItem(1)], devItems: [] });
  busy.prodTable.revisions = [1, 2, 3, 4, 5, 6];
  await assert.rejects(
    () => readSourceSnapshot(busy.prod),
    (error: unknown) =>
      error instanceof DevRefreshError && error.code === 'SOURCE_BUSY'
  );
});

test('apply makes dev match prod, retries unprocessed writes, and never writes prod', async () => {
  const prodItems = [
    revisionItem(12),
    ...Array.from({ length: 30 }, (_, index) =>
      item(`POST#${index}`, `POST#${index}`, 'POST', {
        title: { S: `Post ${index}` },
      })
    ),
  ];
  const env = environments({
    prodItems,
    devItems: [revisionItem(2), item('POST#old', 'POST#old', 'POST')],
    prodImages: [image('images/posts/1/cover/a.webp', '"a"')],
    devImages: [image('images/posts/old/cover/b.webp', '"b"')],
  });
  env.devTable.unprocessedOnce = 3;
  const before = await env.prodTable.scanAll();

  const result = await plan(env.prod, env.dev);
  await applyPlan(result, env.prod.bucket.name, env.dev, {
    sleep: async () => {},
    retryDelaysMs: [0, 0],
  });
  await verifyTarget(result, env.dev);

  assert.deepEqual(
    [...env.devTable.items.keys()].sort(),
    prodItems.map(keyOf).sort()
  );
  assert.deepEqual(
    [...env.devBucket.objects.keys()],
    ['images/posts/1/cover/a.webp']
  );
  assert.deepEqual(await env.prodTable.scanAll(), before);
  assert.equal(planIsEmpty(await plan(env.prod, env.dev)), true);
});

test('apply fails loudly when dev keeps rejecting writes', async () => {
  const env = environments({
    prodItems: [revisionItem(1), item('POST#1', 'POST#1', 'POST')],
    devItems: [],
  });
  env.devTable.batchWrite = async requests => requests;
  const result = await plan(env.prod, env.dev);
  await assert.rejects(
    () =>
      applyPlan(result, env.prod.bucket.name, env.dev, {
        sleep: async () => {},
        retryDelaysMs: [0, 0],
      }),
    (error: unknown) =>
      error instanceof DevRefreshError && error.code === 'WRITE_INCOMPLETE'
  );
});

test('verification fails when dev changes after the plan was applied', async () => {
  const env = environments({
    prodItems: [revisionItem(1), item('POST#1', 'POST#1', 'POST')],
    devItems: [],
  });
  const result = await plan(env.prod, env.dev);
  await applyPlan(result, env.prod.bucket.name, env.dev);
  env.devTable.items.set(
    'POST#new|POST#new',
    item('POST#new', 'POST#new', 'POST')
  );
  await assert.rejects(
    () => verifyTarget(result, env.dev),
    (error: unknown) =>
      error instanceof DevRefreshError && error.code === 'VERIFY_FAILED'
  );
});

test('read-only AWS adapters refuse every write before calling AWS', async () => {
  const sent: string[] = [];
  const client = {
    async send(command: { constructor: { name: string } }) {
      sent.push(command.constructor.name);
      return {};
    },
  };
  const table = new AwsRefreshTable(PROD.tableName, client, false);
  const bucket = new AwsRefreshBucket(
    PROD.bucketName,
    PROD.accountId,
    client,
    false
  );
  const forbidden = (error: unknown) =>
    error instanceof DevRefreshError && error.code === 'SOURCE_WRITE_FORBIDDEN';
  await assert.rejects(
    () => table.batchWrite([{ put: revisionItem(1) }]),
    forbidden
  );
  await assert.rejects(
    () => bucket.copyFrom(DEV.bucketName, 'images/a.webp'),
    forbidden
  );
  await assert.rejects(() => bucket.delete(['images/a.webp']), forbidden);
  assert.deepEqual(sent, []);
});

test('writable bucket adapter only touches keys under images/', async () => {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const client = {
    async send(command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) {
      sent.push({ name: command.constructor.name, input: command.input });
      return {};
    },
  };
  const bucket = new AwsRefreshBucket(
    DEV.bucketName,
    DEV.accountId,
    client,
    true
  );
  const unsafe = (error: unknown) =>
    error instanceof DevRefreshError && error.code === 'UNSAFE_KEY';
  await assert.rejects(() => bucket.delete(['backups/x.json']), unsafe);
  await assert.rejects(
    () => bucket.copyFrom(PROD.bucketName, 'temporary/x'),
    unsafe
  );
  assert.equal(sent.length, 0);

  await bucket.copyFrom(PROD.bucketName, 'images/posts/1/cover/a b.webp');
  assert.equal(sent[0].name, 'CopyObjectCommand');
  assert.equal(
    sent[0].input.CopySource,
    `${PROD.bucketName}/images/posts/1/cover/a%20b.webp`
  );
  assert.equal(sent[0].input.MetadataDirective, 'COPY');
  assert.equal(sent[0].input.ExpectedSourceBucketOwner, DEV.accountId);
});

test('stack description requires every output and reads account and Region from the stack ARN', async () => {
  const stack = {
    StackId:
      'arn:aws:cloudformation:eu-west-1:111122223333:stack/admintonibover-dev/abc',
    StackName: 'admintonibover-dev',
    Outputs: [
      { OutputKey: 'Environment', OutputValue: 'dev' },
      { OutputKey: 'TableName', OutputValue: DEV.tableName },
      { OutputKey: 'BucketName', OutputValue: DEV.bucketName },
    ],
  };
  const client = (value: unknown) => ({ send: async () => value });
  assert.deepEqual(
    await describeEnvironment(
      'admintonibover-dev',
      client({ Stacks: [stack] })
    ),
    DEV
  );
  await assert.rejects(
    () =>
      describeEnvironment(
        'admintonibover-dev',
        client({ Stacks: [{ ...stack, Outputs: stack.Outputs.slice(1) }] })
      ),
    (error: unknown) =>
      error instanceof DevRefreshError && error.code === 'STACK_INCOMPLETE'
  );
});
