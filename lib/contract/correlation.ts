const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** A caller-supplied correlation ID is echoed only when it is this safe. */
export function isCorrelationId(value: string | null | undefined): boolean {
  return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value);
}
