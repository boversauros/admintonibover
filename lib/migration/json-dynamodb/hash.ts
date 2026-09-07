import { createHash } from 'node:crypto';

import type { DynamoItem, DynamoKey } from '../../aws/dynamodb/port';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)])
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function deterministicHash(value: unknown): string {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

export function itemKey(item: DynamoKey): string {
  return `${item.PK}\u0000${item.SK}`;
}

export function keyFingerprint(item: DynamoKey): string {
  return deterministicHash(itemKey(item)).slice(0, 16);
}

function withoutMigration(item: DynamoItem): DynamoItem {
  const content = { ...item };
  delete content.migration;
  return content;
}

export function postContentHash(items: DynamoItem[]): string {
  return deterministicHash(
    items
      .filter(
        item =>
          item.entityType === 'POST' || item.entityType === 'REFERENCE_SEGMENT'
      )
      .sort((left, right) => itemKey(left).localeCompare(itemKey(right)))
      .map(withoutMigration)
  );
}
