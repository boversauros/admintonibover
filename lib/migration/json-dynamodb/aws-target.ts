import {
  DescribeTableCommand,
  DynamoDBClient,
  type AttributeDefinition,
  type DescribeTableCommandOutput,
  type KeySchemaElement,
} from '@aws-sdk/client-dynamodb';

import { createAwsDynamoDbPort } from '../../aws/dynamodb/aws-port';
import type { AwsDynamoDbPort } from '../../aws/dynamodb/aws-port';
import { assertValidMigrationTarget } from './guards';
import type { MigrationTarget } from './types';

type DescribeTableClient = {
  send(command: DescribeTableCommand): Promise<DescribeTableCommandOutput>;
};

export class MigrationTargetError extends Error {
  readonly code = 'MIGRATION_TARGET_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationTargetError';
  }
}

function assertTargetArn(
  arn: string | undefined,
  target: MigrationTarget
): void {
  const parts = arn?.split(':') ?? [];
  if (
    parts.length < 6 ||
    parts[2] !== 'dynamodb' ||
    parts[3] !== target.region ||
    parts[4] !== target.accountId ||
    parts.slice(5).join(':') !== `table/${target.tableName}`
  ) {
    throw new MigrationTargetError(
      'DynamoDB table ARN does not match the confirmed account, Region, and table'
    );
  }
}

function assertKeySchema(keySchema: KeySchemaElement[] | undefined): void {
  if (!Array.isArray(keySchema) || keySchema.length !== 2) {
    throw new MigrationTargetError('DynamoDB table must have exactly two keys');
  }
  const partition = keySchema.find(entry => entry.KeyType === 'HASH');
  const sort = keySchema.find(entry => entry.KeyType === 'RANGE');
  if (partition?.AttributeName !== 'PK' || sort?.AttributeName !== 'SK') {
    throw new MigrationTargetError(
      'DynamoDB table key schema must be PK (partition) and SK (sort)'
    );
  }
}

function assertStringKeyDefinitions(
  definitions: AttributeDefinition[] | undefined
): void {
  if (!Array.isArray(definitions)) {
    throw new MigrationTargetError(
      'DynamoDB target is missing attribute definitions'
    );
  }
  for (const name of ['PK', 'SK']) {
    const definition = definitions.find(entry => entry.AttributeName === name);
    if (definition?.AttributeType !== 'S') {
      throw new MigrationTargetError(
        'DynamoDB PK and SK attributes must use the string type'
      );
    }
  }
}

export async function verifyMigrationTarget(
  target: MigrationTarget,
  client: DescribeTableClient
): Promise<void> {
  assertValidMigrationTarget(target);
  const result = await client.send(
    new DescribeTableCommand({ TableName: target.tableName })
  );
  const table = result.Table;
  if (!table || table.TableName !== target.tableName) {
    throw new MigrationTargetError(
      'DynamoDB returned a different target table'
    );
  }
  if (table.TableStatus !== 'ACTIVE') {
    throw new MigrationTargetError('DynamoDB target table is not ACTIVE');
  }
  assertTargetArn(table.TableArn, target);
  assertKeySchema(table.KeySchema);
  assertStringKeyDefinitions(table.AttributeDefinitions);
  if (table.BillingModeSummary?.BillingMode !== 'PAY_PER_REQUEST') {
    throw new MigrationTargetError(
      'DynamoDB target must use PAY_PER_REQUEST billing mode'
    );
  }
}

export async function createVerifiedMigrationPort(
  target: MigrationTarget,
  client: DynamoDBClient = new DynamoDBClient({ region: target.region })
): Promise<AwsDynamoDbPort> {
  await verifyMigrationTarget(target, client);
  return createAwsDynamoDbPort(target.tableName, client);
}
