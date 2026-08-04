import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

import {
  DynamoTransactionCanceledError,
  type DynamoCondition,
  type DynamoDbPort,
  type DynamoItem,
  type DynamoKey,
  type DynamoQueryInput,
  type DynamoQueryPage,
  type DynamoTransactionAction,
} from './port';

type AwsTransactionItem = NonNullable<
  TransactWriteCommandInput['TransactItems']
>[number];

type ExpressionParts = {
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
};

function conditionExpression(condition: DynamoCondition): ExpressionParts {
  const names = { '#condition': condition.attribute };
  if (condition.type === 'attributeNotExists') {
    return {
      ConditionExpression: 'attribute_not_exists(#condition)',
      ExpressionAttributeNames: names,
    };
  }
  if (condition.type === 'equals') {
    return {
      ConditionExpression: '#condition = :condition',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ':condition': condition.value },
    };
  }
  return {
    ConditionExpression:
      '(attribute_not_exists(#condition) OR #condition = :condition)',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: { ':condition': condition.value },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function item(value: Record<string, unknown> | undefined): DynamoItem | null {
  if (!value) return null;
  if (typeof value.PK !== 'string' || typeof value.SK !== 'string') {
    throw new TypeError(
      'DynamoDB returned an item without string PK/SK values'
    );
  }
  return value as DynamoItem;
}

function key(
  value: Record<string, unknown> | undefined
): DynamoKey | undefined {
  if (!value) return undefined;
  if (typeof value.PK !== 'string' || typeof value.SK !== 'string') {
    throw new TypeError('DynamoDB returned an invalid pagination key');
  }
  return { PK: value.PK, SK: value.SK };
}

function cancellationReasons(error: unknown): Array<string | null> | null {
  if (!isRecord(error) || error.name !== 'TransactionCanceledException') {
    return null;
  }
  const reasons = error.CancellationReasons;
  if (!Array.isArray(reasons)) return [];
  return reasons.map(reason => {
    if (!isRecord(reason) || typeof reason.Code !== 'string') return null;
    return reason.Code === 'None' ? null : reason.Code;
  });
}

export class AwsDynamoDbPort implements DynamoDbPort {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBDocumentClient
  ) {
    if (tableName.length === 0) throw new TypeError('tableName is required');
  }

  async get(
    keyValue: DynamoKey,
    consistentRead: boolean
  ): Promise<DynamoItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keyValue,
        ConsistentRead: consistentRead,
      })
    );
    return item(result.Item);
  }

  async query(input: DynamoQueryInput): Promise<DynamoQueryPage> {
    const hasSortPrefix = input.sortKeyBeginsWith !== undefined;
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: hasSortPrefix
          ? '#pk = :pk AND begins_with(#sk, :sk)'
          : '#pk = :pk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          ...(hasSortPrefix ? { '#sk': 'SK' } : {}),
        },
        ExpressionAttributeValues: {
          ':pk': input.partitionKey,
          ...(hasSortPrefix ? { ':sk': input.sortKeyBeginsWith } : {}),
        },
        ConsistentRead: input.consistentRead,
        ScanIndexForward: input.scanIndexForward,
        ExclusiveStartKey: input.exclusiveStartKey,
        Limit: input.limit,
      })
    );
    return {
      items: (result.Items ?? []).map(value => item(value)!),
      ...(result.LastEvaluatedKey
        ? { lastEvaluatedKey: key(result.LastEvaluatedKey)! }
        : {}),
    };
  }

  async transactWrite(actions: DynamoTransactionAction[]): Promise<void> {
    const transactItems = actions.map(action => this.transactionItem(action));
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        })
      );
    } catch (error) {
      const reasons = cancellationReasons(error);
      if (reasons !== null) throw new DynamoTransactionCanceledError(reasons);
      throw error;
    }
  }

  private transactionItem(action: DynamoTransactionAction): AwsTransactionItem {
    if (action.type === 'put') {
      return {
        Put: {
          TableName: this.tableName,
          Item: action.item,
          ...(action.condition ? conditionExpression(action.condition) : {}),
        },
      };
    }
    if (action.type === 'delete') {
      return {
        Delete: {
          TableName: this.tableName,
          Key: action.key,
          ...(action.condition ? conditionExpression(action.condition) : {}),
        },
      };
    }

    const setEntries = Object.entries(action.set);
    const names: Record<string, string> = {
      '#increment': action.attribute,
    };
    const values: Record<string, unknown> = {
      ':initial': action.initialValue,
      ':by': action.by,
    };
    const assignments = setEntries.map(([attribute, value], index) => {
      names[`#set${index}`] = attribute;
      values[`:set${index}`] = value;
      return `#set${index} = :set${index}`;
    });
    return {
      Update: {
        TableName: this.tableName,
        Key: action.key,
        UpdateExpression: `SET #increment = if_not_exists(#increment, :initial) + :by${
          assignments.length > 0 ? `, ${assignments.join(', ')}` : ''
        }`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    };
  }
}

export function createAwsDynamoDbPort(
  tableName: string,
  client: DynamoDBClient = new DynamoDBClient({})
): AwsDynamoDbPort {
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
  return new AwsDynamoDbPort(tableName, documentClient);
}
