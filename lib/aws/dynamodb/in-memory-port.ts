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

function itemKey(key: DynamoKey): string {
  return `${key.PK}\u0000${key.SK}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function conditionMatches(
  item: DynamoItem | undefined,
  condition: DynamoCondition | undefined
): boolean {
  if (!condition) return true;
  if (condition.type === 'attributeNotExists') {
    return item === undefined || item[condition.attribute] === undefined;
  }
  if (condition.type === 'equals') {
    return item !== undefined && item[condition.attribute] === condition.value;
  }
  return (
    item === undefined ||
    item[condition.attribute] === undefined ||
    item[condition.attribute] === condition.value
  );
}

export class InMemoryDynamoDbPort implements DynamoDbPort {
  readonly requests = {
    gets: 0,
    queries: 0,
    transactions: 0,
  };

  private readonly items = new Map<string, DynamoItem>();

  constructor(
    initialItems: DynamoItem[] = [],
    private readonly maximumPageSize = Number.POSITIVE_INFINITY
  ) {
    for (const item of initialItems) {
      this.items.set(itemKey(item), clone(item));
    }
  }

  async get(key: DynamoKey): Promise<DynamoItem | null> {
    this.requests.gets += 1;
    const item = this.items.get(itemKey(key));
    return item ? clone(item) : null;
  }

  async query(input: DynamoQueryInput): Promise<DynamoQueryPage> {
    this.requests.queries += 1;
    const ascending = [...this.items.values()]
      .filter(item => item.PK === input.partitionKey)
      .filter(
        item =>
          input.sortKeyBeginsWith === undefined ||
          item.SK.startsWith(input.sortKeyBeginsWith)
      )
      .sort((left, right) => left.SK.localeCompare(right.SK));
    const ordered = input.scanIndexForward ? ascending : ascending.reverse();
    const startIndex = input.exclusiveStartKey
      ? ordered.findIndex(
          item => itemKey(item) === itemKey(input.exclusiveStartKey!)
        ) + 1
      : 0;
    const safeStartIndex = Math.max(0, startIndex);
    const pageSize = Math.max(1, Math.min(input.limit, this.maximumPageSize));
    const pageItems = ordered.slice(safeStartIndex, safeStartIndex + pageSize);
    const hasMore = safeStartIndex + pageItems.length < ordered.length;

    return {
      items: pageItems.map(clone),
      ...(hasMore && pageItems.length > 0
        ? {
            lastEvaluatedKey: {
              PK: pageItems.at(-1)!.PK,
              SK: pageItems.at(-1)!.SK,
            },
          }
        : {}),
    };
  }

  async transactWrite(actions: DynamoTransactionAction[]): Promise<void> {
    this.requests.transactions += 1;
    const actionKeys = new Set<string>();
    for (const action of actions) {
      const key = action.type === 'put' ? action.item : action.key;
      const encoded = itemKey(key);
      if (actionKeys.has(encoded)) {
        throw new Error('A transaction cannot target the same item twice');
      }
      actionKeys.add(encoded);
    }

    const reasons = actions.map(action => {
      if (action.type === 'increment') return null;
      const key = action.type === 'put' ? action.item : action.key;
      return conditionMatches(this.items.get(itemKey(key)), action.condition)
        ? null
        : 'ConditionalCheckFailed';
    });
    if (reasons.some(reason => reason !== null)) {
      throw new DynamoTransactionCanceledError(reasons);
    }

    const next = new Map(
      [...this.items].map(([key, item]) => [key, clone(item)])
    );
    for (const action of actions) {
      if (action.type === 'put') {
        next.set(itemKey(action.item), clone(action.item));
        continue;
      }
      if (action.type === 'delete') {
        next.delete(itemKey(action.key));
        continue;
      }

      const encoded = itemKey(action.key);
      const current = next.get(encoded);
      const currentValue = current?.[action.attribute];
      const baseValue =
        typeof currentValue === 'number' ? currentValue : action.initialValue;
      next.set(encoded, {
        ...(current ?? action.key),
        ...clone(action.set),
        [action.attribute]: baseValue + action.by,
      });
    }

    this.items.clear();
    for (const [key, item] of next) this.items.set(key, item);
  }

  snapshot(): DynamoItem[] {
    return [...this.items.values()]
      .sort((left, right) => itemKey(left).localeCompare(itemKey(right)))
      .map(clone);
  }
}
