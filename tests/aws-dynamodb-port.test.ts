import assert from 'node:assert/strict';
import test from 'node:test';

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { AwsDynamoDbPort } from '../lib/aws/dynamodb/aws-port';
import { DynamoTransactionCanceledError } from '../lib/aws/dynamodb/port';

type CommandLike = {
  constructor: { name: string };
  input: Record<string, unknown>;
};

function fakeDocumentClient(
  send: (command: CommandLike) => Promise<Record<string, unknown>>
): DynamoDBDocumentClient {
  return { send } as unknown as DynamoDBDocumentClient;
}

test('AWS port maps strong get and paginated query requests without network', async () => {
  const commands: CommandLike[] = [];
  const client = fakeDocumentClient(async command => {
    commands.push(command);
    if (command.constructor.name === 'GetCommand') {
      return { Item: { PK: 'POST#1', SK: 'POST#1', entityType: 'POST' } };
    }
    return {
      Items: [{ PK: 'POSTS', SK: 'ORDER#1', entityType: 'POST_SUMMARY' }],
      LastEvaluatedKey: { PK: 'POSTS', SK: 'ORDER#1' },
    };
  });
  const port = new AwsDynamoDbPort('content-table', client);

  assert.deepEqual(await port.get({ PK: 'POST#1', SK: 'POST#1' }, true), {
    PK: 'POST#1',
    SK: 'POST#1',
    entityType: 'POST',
  });
  const page = await port.query({
    partitionKey: 'POST#1',
    sortKeyBeginsWith: 'REFS#',
    consistentRead: true,
    scanIndexForward: true,
    exclusiveStartKey: { PK: 'POST#1', SK: 'REFS#ca#000001' },
    limit: 25,
  });

  assert.deepEqual(page.lastEvaluatedKey, { PK: 'POSTS', SK: 'ORDER#1' });
  assert.deepEqual(commands[0].input, {
    TableName: 'content-table',
    Key: { PK: 'POST#1', SK: 'POST#1' },
    ConsistentRead: true,
  });
  assert.deepEqual(commands[1].input, {
    TableName: 'content-table',
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
    ExpressionAttributeValues: { ':pk': 'POST#1', ':sk': 'REFS#' },
    ConsistentRead: true,
    ScanIndexForward: true,
    ExclusiveStartKey: { PK: 'POST#1', SK: 'REFS#ca#000001' },
    Limit: 25,
  });
});

test('AWS port maps transaction conditions and revision increment', async () => {
  const commands: CommandLike[] = [];
  const port = new AwsDynamoDbPort(
    'content-table',
    fakeDocumentClient(async command => {
      commands.push(command);
      return {};
    })
  );

  await port.transactWrite([
    {
      type: 'put',
      label: 'aggregate:update',
      item: { PK: 'POST#1', SK: 'POST#1', version: 2 },
      condition: { type: 'equals', attribute: 'version', value: 1 },
    },
    {
      type: 'delete',
      label: 'slug:ca:release',
      key: { PK: 'SLUG#ca#old', SK: 'LOCK' },
      condition: { type: 'equals', attribute: 'postId', value: '1' },
    },
    {
      type: 'increment',
      label: 'revision',
      key: { PK: 'SYSTEM', SK: 'REVISION' },
      attribute: 'revision',
      by: 1,
      initialValue: 0,
      set: { entityType: 'DATA_REVISION', schemaVersion: 1 },
    },
  ]);

  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].input, {
    TransactItems: [
      {
        Put: {
          TableName: 'content-table',
          Item: { PK: 'POST#1', SK: 'POST#1', version: 2 },
          ConditionExpression: '#condition = :condition',
          ExpressionAttributeNames: { '#condition': 'version' },
          ExpressionAttributeValues: { ':condition': 1 },
        },
      },
      {
        Delete: {
          TableName: 'content-table',
          Key: { PK: 'SLUG#ca#old', SK: 'LOCK' },
          ConditionExpression: '#condition = :condition',
          ExpressionAttributeNames: { '#condition': 'postId' },
          ExpressionAttributeValues: { ':condition': '1' },
        },
      },
      {
        Update: {
          TableName: 'content-table',
          Key: { PK: 'SYSTEM', SK: 'REVISION' },
          UpdateExpression:
            'SET #increment = if_not_exists(#increment, :initial) + :by, #set0 = :set0, #set1 = :set1',
          ExpressionAttributeNames: {
            '#increment': 'revision',
            '#set0': 'entityType',
            '#set1': 'schemaVersion',
          },
          ExpressionAttributeValues: {
            ':initial': 0,
            ':by': 1,
            ':set0': 'DATA_REVISION',
            ':set1': 1,
          },
        },
      },
    ],
  });
});

test('AWS port converts transaction cancellation reasons for repository errors', async () => {
  const failure = Object.assign(new Error('cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
  });
  const port = new AwsDynamoDbPort(
    'content-table',
    fakeDocumentClient(async () => {
      throw failure;
    })
  );

  await assert.rejects(
    port.transactWrite([
      {
        type: 'put',
        label: 'aggregate:update',
        item: { PK: 'POST#1', SK: 'POST#1' },
      },
      {
        type: 'put',
        label: 'slug:ca:acquire',
        item: { PK: 'SLUG#ca#new', SK: 'LOCK' },
      },
    ]),
    (error: unknown) =>
      error instanceof DynamoTransactionCanceledError &&
      error.reasons[0] === null &&
      error.reasons[1] === 'ConditionalCheckFailed'
  );
});
