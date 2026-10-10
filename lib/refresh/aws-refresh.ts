import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
  type AttributeValue,
  type WriteRequest as DynamoWriteRequest,
} from '@aws-sdk/client-dynamodb';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  DevRefreshError,
  IMAGE_PREFIX,
  REVISION_KEY,
  assertRefreshDirection,
  type EnvironmentResources,
  type RawItem,
  type RefreshBucket,
  type RefreshSide,
  type RefreshTable,
  type StoredObject,
  type WriteRequest,
} from './dev-refresh';

type Sender = { send(command: unknown): Promise<unknown> };

const SCAN_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 1_000;

function readOnly(name: string): never {
  throw new DevRefreshError(
    'SOURCE_WRITE_FORBIDDEN',
    `Refusing to write to read-only source ${name}`
  );
}

export class AwsRefreshTable implements RefreshTable {
  constructor(
    readonly name: string,
    private readonly client: Sender,
    private readonly writable: boolean
  ) {}

  async getRevision(): Promise<number | null> {
    const result = (await this.client.send(
      new GetItemCommand({
        TableName: this.name,
        ConsistentRead: true,
        Key: { PK: { S: REVISION_KEY.PK }, SK: { S: REVISION_KEY.SK } },
      })
    )) as { Item?: RawItem };
    const value = result.Item?.revision?.N;
    if (value === undefined) return null;
    const revision = Number(value);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new DevRefreshError(
        'INVALID_REVISION',
        `${this.name} has an invalid data revision`
      );
    }
    return revision;
  }

  async scanAll(): Promise<RawItem[]> {
    const items: RawItem[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;
    do {
      const page = (await this.client.send(
        new ScanCommand({
          TableName: this.name,
          ConsistentRead: true,
          Limit: SCAN_PAGE_SIZE,
          ExclusiveStartKey: exclusiveStartKey,
        })
      )) as {
        Items?: RawItem[];
        LastEvaluatedKey?: Record<string, AttributeValue>;
      };
      items.push(...(page.Items ?? []));
      exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);
    return items;
  }

  async batchWrite(requests: WriteRequest[]): Promise<WriteRequest[]> {
    if (!this.writable) readOnly(this.name);
    const result = (await this.client.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [this.name]: requests.map(request =>
            'put' in request
              ? { PutRequest: { Item: request.put } }
              : { DeleteRequest: { Key: request.delete } }
          ),
        },
      })
    )) as { UnprocessedItems?: Record<string, DynamoWriteRequest[]> };
    return (result.UnprocessedItems?.[this.name] ?? []).map(request => {
      if (request.PutRequest?.Item) return { put: request.PutRequest.Item };
      if (request.DeleteRequest?.Key) {
        const { PK, SK } = request.DeleteRequest.Key;
        return { delete: { PK, SK } };
      }
      throw new DevRefreshError(
        'WRITE_INCOMPLETE',
        'DynamoDB returned an unreadable unprocessed request'
      );
    });
  }
}

function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export class AwsRefreshBucket implements RefreshBucket {
  constructor(
    readonly name: string,
    private readonly accountId: string,
    private readonly client: Sender,
    private readonly writable: boolean
  ) {}

  async list(prefix: string): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    do {
      const page = (await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.name,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          ExpectedBucketOwner: this.accountId,
        })
      )) as {
        Contents?: { Key?: string; ETag?: string; Size?: number }[];
        NextContinuationToken?: string;
      };
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        objects.push({
          key: object.Key,
          etag: object.ETag ?? '',
          size: object.Size ?? 0,
        });
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken !== undefined);
    return objects;
  }

  async copyFrom(sourceBucket: string, key: string): Promise<void> {
    if (!this.writable) readOnly(this.name);
    if (!key.startsWith(IMAGE_PREFIX)) {
      throw new DevRefreshError('UNSAFE_KEY', `Refusing to copy ${key}`);
    }
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.name,
        Key: key,
        CopySource: copySource(sourceBucket, key),
        MetadataDirective: 'COPY',
        ExpectedBucketOwner: this.accountId,
        ExpectedSourceBucketOwner: this.accountId,
      })
    );
  }

  async delete(keys: string[]): Promise<void> {
    if (!this.writable) readOnly(this.name);
    const unsafe = keys.find(key => !key.startsWith(IMAGE_PREFIX));
    if (unsafe) {
      throw new DevRefreshError('UNSAFE_KEY', `Refusing to delete ${unsafe}`);
    }
    for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
      const batch = keys.slice(index, index + DELETE_BATCH_SIZE);
      const result = (await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.name,
          Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
          ExpectedBucketOwner: this.accountId,
        })
      )) as { Errors?: { Key?: string }[] };
      if (result.Errors?.length) {
        throw new DevRefreshError(
          'DELETE_INCOMPLETE',
          `${result.Errors.length} dev images could not be deleted; run the refresh again`
        );
      }
    }
  }
}

export async function describeEnvironment(
  stackName: string,
  client: Sender
): Promise<EnvironmentResources> {
  const result = (await client.send(
    new DescribeStacksCommand({ StackName: stackName })
  )) as {
    Stacks?: {
      StackId?: string;
      StackName?: string;
      Outputs?: { OutputKey?: string; OutputValue?: string }[];
    }[];
  };
  const stack = result.Stacks?.[0];
  const arn = stack?.StackId?.split(':') ?? [];
  const output = (key: string) =>
    stack?.Outputs?.find(item => item.OutputKey === key)?.OutputValue;
  const resources = {
    environment: output('Environment') ?? '',
    stackName: stack?.StackName ?? '',
    region: arn[3] ?? '',
    accountId: arn[4] ?? '',
    tableName: output('TableName') ?? '',
    bucketName: output('BucketName') ?? '',
  };
  const missing = Object.entries(resources).find(([, value]) => !value);
  if (missing) {
    throw new DevRefreshError(
      'STACK_INCOMPLETE',
      `Stack ${stackName} is missing ${missing[0]}`
    );
  }
  return resources;
}

export type AwsRefreshSetup = {
  source: EnvironmentResources;
  target: EnvironmentResources;
  sourceSide: RefreshSide;
  targetSide: RefreshSide;
  destroy(): void;
};

export async function createAwsRefresh(input: {
  region: string;
  sourceStack: string;
  targetStack: string;
}): Promise<AwsRefreshSetup> {
  const cloudFormation = new CloudFormationClient({ region: input.region });
  let source: EnvironmentResources;
  let target: EnvironmentResources;
  try {
    source = await describeEnvironment(input.sourceStack, cloudFormation);
    target = await describeEnvironment(input.targetStack, cloudFormation);
  } finally {
    cloudFormation.destroy();
  }
  // Nothing writable exists until the direction guard has passed.
  assertRefreshDirection(source, target);

  const dynamodb = new DynamoDBClient({ region: input.region });
  const s3 = new S3Client({ region: input.region });
  return {
    source,
    target,
    sourceSide: {
      table: new AwsRefreshTable(source.tableName, dynamodb, false),
      bucket: new AwsRefreshBucket(
        source.bucketName,
        source.accountId,
        s3,
        false
      ),
    },
    targetSide: {
      table: new AwsRefreshTable(target.tableName, dynamodb, true),
      bucket: new AwsRefreshBucket(
        target.bucketName,
        target.accountId,
        s3,
        true
      ),
    },
    destroy() {
      dynamodb.destroy();
      s3.destroy();
    },
  };
}
