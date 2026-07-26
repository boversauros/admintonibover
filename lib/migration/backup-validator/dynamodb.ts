import {
  REFERENCE_SEGMENT_TARGET_BYTES,
  type AggregateReference,
  type LanguageCode,
  type ReferenceSegment,
} from './types';

const utf8Bytes = (value: string): number => Buffer.byteLength(value, 'utf8');

function significantDigitCount(value: number): number {
  if (value === 0) return 0;

  const [mantissa] = Math.abs(value).toString().toLowerCase().split('e');
  const digits = mantissa
    .replace('.', '')
    .replace(/^0+/, '')
    .replace(/0+$/, '');
  return digits.length;
}

function estimateNumberBytes(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('DynamoDB numbers must be finite');
  }

  const significantDigits = significantDigitCount(value);
  return significantDigits === 0 ? 1 : Math.ceil(significantDigits / 2) + 1;
}

function estimateUnnamedValueBytes(value: unknown): number {
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'string') return utf8Bytes(value);
  if (typeof value === 'number') return estimateNumberBytes(value);

  if (Array.isArray(value)) {
    return (
      3 +
      value.reduce(
        (total, element) => total + estimateUnnamedValueBytes(element) + 1,
        0
      )
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      3 +
      Object.entries(value).reduce((total, [name, nestedValue]) => {
        if (nestedValue === undefined) return total;
        return total + estimateNamedValueBytes(name, nestedValue) + 1;
      }, 0)
    );
  }

  throw new TypeError(`Unsupported DynamoDB value type: ${typeof value}`);
}

function estimateNamedValueBytes(name: string, value: unknown): number {
  return utf8Bytes(name) + estimateUnnamedValueBytes(value);
}

/**
 * Estimates the persisted DynamoDB item bytes using AWS's documented rules.
 * The table item itself has no Map overhead; every nested List/Map does.
 */
export function estimateDynamoDbItemSize(item: object): number {
  return Object.entries(item).reduce((total, [name, value]) => {
    if (value === undefined) return total;
    return total + estimateNamedValueBytes(name, value);
  }, 0);
}

function createReferenceSegment(
  postId: string,
  language: LanguageCode,
  sequence: number,
  references: AggregateReference[]
): ReferenceSegment {
  const paddedSequence = sequence.toString().padStart(6, '0');

  return {
    PK: `POST#${postId}`,
    SK: `REFS#${language}#${paddedSequence}`,
    entityType: 'REFERENCE_SEGMENT',
    schemaVersion: 1,
    postId,
    language,
    sequence,
    version: 1,
    references,
  };
}

export function segmentReferences(
  postId: string,
  language: LanguageCode,
  references: AggregateReference[]
): ReferenceSegment[] {
  const segments: ReferenceSegment[] = [];
  let current: AggregateReference[] = [];

  for (const reference of references) {
    const candidate = createReferenceSegment(
      postId,
      language,
      segments.length,
      [...current, reference]
    );
    const candidateBytes = estimateDynamoDbItemSize(candidate);

    if (current.length > 0 && candidateBytes > REFERENCE_SEGMENT_TARGET_BYTES) {
      segments.push(
        createReferenceSegment(postId, language, segments.length, current)
      );
      current = [reference];
      continue;
    }

    current.push(reference);
  }

  if (current.length > 0) {
    segments.push(
      createReferenceSegment(postId, language, segments.length, current)
    );
  }

  return segments;
}
