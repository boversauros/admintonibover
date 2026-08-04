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

/** Estimates DynamoDB item bytes using AWS's documented storage rules. */
export function estimateDynamoDbItemSize(item: object): number {
  return Object.entries(item).reduce((total, [name, value]) => {
    if (value === undefined) return total;
    return total + estimateNamedValueBytes(name, value);
  }, 0);
}
