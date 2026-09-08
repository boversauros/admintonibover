import type { MigrationTarget } from './types';

const AWS_ACCOUNT_ID_PATTERN = /^\d{12}$/;
const AWS_REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const DYNAMODB_TABLE_PATTERN = /^[A-Za-z0-9_.-]{3,255}$/;

export class MigrationConfirmationError extends Error {
  readonly code = 'MIGRATION_CONFIRMATION_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'MigrationConfirmationError';
  }
}

export function assertValidMigrationTarget(target: MigrationTarget): void {
  if (!AWS_ACCOUNT_ID_PATTERN.test(target.accountId)) {
    throw new MigrationConfirmationError(
      'AWS account ID must contain exactly 12 digits'
    );
  }
  if (!AWS_REGION_PATTERN.test(target.region)) {
    throw new MigrationConfirmationError('AWS Region is invalid');
  }
  if (!DYNAMODB_TABLE_PATTERN.test(target.tableName)) {
    throw new MigrationConfirmationError('DynamoDB table name is invalid');
  }
}

export function isProductionLookingTarget(target: MigrationTarget): boolean {
  return target.environment === 'prod' || /prod/i.test(target.tableName);
}

export function executeConfirmation(
  target: MigrationTarget,
  sourceSha256: string
): string {
  return `MIGRATE ${target.environment} ${target.accountId}/${target.region}/${target.tableName} ${sourceSha256}`;
}

export function productionConfirmation(
  target: MigrationTarget,
  sourceSha256: string
): string {
  return `ALLOW PRODUCTION ${target.accountId}/${target.region}/${target.tableName} ${sourceSha256}`;
}

export function rollbackConfirmation(
  target: MigrationTarget,
  runId: string
): string {
  return `ROLLBACK ${runId} ${target.accountId}/${target.region}/${target.tableName}`;
}

export function assertExecuteAllowed(input: {
  target: MigrationTarget;
  sourceSha256: string;
  confirmation?: string;
  allowProduction?: boolean;
  productionConfirmation?: string;
}): void {
  assertValidMigrationTarget(input.target);
  if (
    input.confirmation !== executeConfirmation(input.target, input.sourceSha256)
  ) {
    throw new MigrationConfirmationError(
      `Execute confirmation does not exactly match: ${executeConfirmation(
        input.target,
        input.sourceSha256
      )}`
    );
  }
  if (!isProductionLookingTarget(input.target)) return;
  if (!input.allowProduction) {
    throw new MigrationConfirmationError(
      'Production-looking targets require --allow-production'
    );
  }
  if (
    input.productionConfirmation !==
    productionConfirmation(input.target, input.sourceSha256)
  ) {
    throw new MigrationConfirmationError(
      `Production confirmation does not exactly match: ${productionConfirmation(
        input.target,
        input.sourceSha256
      )}`
    );
  }
}

export function assertRollbackAllowed(input: {
  target: MigrationTarget;
  runId: string;
  confirmation?: string;
  allowProduction?: boolean;
  productionConfirmation?: string;
  sourceSha256: string;
}): void {
  assertValidMigrationTarget(input.target);
  if (input.confirmation !== rollbackConfirmation(input.target, input.runId)) {
    throw new MigrationConfirmationError(
      `Rollback confirmation does not exactly match: ${rollbackConfirmation(
        input.target,
        input.runId
      )}`
    );
  }
  if (!isProductionLookingTarget(input.target)) return;
  if (!input.allowProduction) {
    throw new MigrationConfirmationError(
      'Production-looking targets require --allow-production'
    );
  }
  if (
    input.productionConfirmation !==
    productionConfirmation(input.target, input.sourceSha256)
  ) {
    throw new MigrationConfirmationError(
      `Production confirmation does not exactly match: ${productionConfirmation(
        input.target,
        input.sourceSha256
      )}`
    );
  }
}
