export type DynamoKey = {
  PK: string;
  SK: string;
};

export type DynamoItem = DynamoKey & Record<string, unknown>;

export type DynamoCondition =
  | { type: 'attributeNotExists'; attribute: string }
  | { type: 'equals'; attribute: string; value: unknown }
  | {
      type: 'attributeNotExistsOrEquals';
      attribute: string;
      value: unknown;
    };

type DynamoActionBase = {
  label: string;
};

export type DynamoPutAction = DynamoActionBase & {
  type: 'put';
  item: DynamoItem;
  condition?: DynamoCondition;
};

export type DynamoDeleteAction = DynamoActionBase & {
  type: 'delete';
  key: DynamoKey;
  condition?: DynamoCondition;
};

export type DynamoIncrementAction = DynamoActionBase & {
  type: 'increment';
  key: DynamoKey;
  attribute: string;
  by: number;
  initialValue: number;
  set: Record<string, unknown>;
};

export type DynamoTransactionAction =
  | DynamoPutAction
  | DynamoDeleteAction
  | DynamoIncrementAction;

export type DynamoQueryInput = {
  partitionKey: string;
  sortKeyBeginsWith?: string;
  consistentRead: boolean;
  scanIndexForward: boolean;
  exclusiveStartKey?: DynamoKey;
  limit: number;
};

export type DynamoQueryPage = {
  items: DynamoItem[];
  lastEvaluatedKey?: DynamoKey;
};

export interface DynamoDbPort {
  get(key: DynamoKey, consistentRead: boolean): Promise<DynamoItem | null>;
  query(input: DynamoQueryInput): Promise<DynamoQueryPage>;
  transactWrite(actions: DynamoTransactionAction[]): Promise<void>;
}

export class DynamoTransactionCanceledError extends Error {
  constructor(readonly reasons: Array<string | null>) {
    super('DynamoDB transaction was canceled');
    this.name = 'DynamoTransactionCanceledError';
  }
}
