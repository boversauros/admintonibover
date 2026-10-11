import { createHash } from 'node:crypto';

import type { MutationReservation, StoredMutationResult } from './store';

export function mutationDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

export function reservationResult(
  reservation: MutationReservation
): StoredMutationResult | null {
  return reservation.state === 'replay' ? reservation.result : null;
}

export function requiredReservation(
  reservation: MutationReservation
): Extract<MutationReservation, { state: 'reserved' }> {
  if (reservation.state !== 'reserved') {
    throw new TypeError('Mutation reservation is not writable');
  }
  return reservation;
}

export function resultString(
  result: StoredMutationResult,
  field: string
): string {
  const value = result[field];
  if (typeof value !== 'string') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

export function resultStrings(
  result: StoredMutationResult,
  field: string
): string[] {
  const value = result[field];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

export function resultNullableString(
  result: StoredMutationResult,
  field: string
): string | null {
  const value = result[field];
  if (value !== null && typeof value !== 'string') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

export function resultBoolean(
  result: StoredMutationResult,
  field: string
): boolean {
  const value = result[field];
  if (typeof value !== 'boolean') {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value;
}

export function resultInteger(
  result: StoredMutationResult,
  field: string
): number {
  const value = result[field];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError('Stored idempotency result is invalid');
  }
  return value as number;
}
