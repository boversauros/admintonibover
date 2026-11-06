/**
 * The one set of primitive shape checks for untrusted JSON, used by the
 * Lambda (request bodies, stored rows), the BFF and the browser (responses).
 * Each failure names the path and a stable code, so every caller can turn it
 * into its own error type.
 */
export class ShapeError extends TypeError {
  constructor(
    readonly path: string,
    readonly code: string,
    message: string
  ) {
    super(`${path} ${message}`);
    this.name = 'ShapeError';
  }
}

/** Joins a parent path and a key; an empty parent is the document root. */
export function at(path: string, key: string | number): string {
  return path ? `${path}.${key}` : String(key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function recordValue(
  value: unknown,
  path: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ShapeError(path, 'INVALID_OBJECT', 'must be an object');
  }
  return value;
}

export function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ShapeError(path, 'INVALID_STRING', 'must be a string');
  }
  return value;
}

export function nullableStringValue(
  value: unknown,
  path: string
): string | null {
  return value === null ? null : stringValue(value, path);
}

export function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShapeError(path, 'INVALID_NUMBER', 'must be a finite number');
  }
  return value;
}

export function integerValue(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new ShapeError(path, 'INVALID_INTEGER', 'must be an integer');
  }
  return value as number;
}

export function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ShapeError(path, 'INVALID_BOOLEAN', 'must be true or false');
  }
  return value;
}

export function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ShapeError(path, 'INVALID_ARRAY', 'must be an array');
  }
  return value;
}

/** Accepts only one of the listed string values. */
export function oneOf<const T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[]
): T {
  if (!allowed.includes(value as T)) {
    throw new ShapeError(
      path,
      'INVALID_VALUE',
      `must be one of ${allowed.join(', ')}`
    );
  }
  return value as T;
}
