import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const templatePath = new URL(
  '../infra/migration-disposable-table.template.json',
  import.meta.url
);

test('migration acceptance IaC creates exactly one disposable development table', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8')) as {
    Parameters: Record<string, unknown>;
    Resources: Record<
      string,
      {
        Type: string;
        DeletionPolicy?: string;
        UpdateReplacePolicy?: string;
        Properties: Record<string, unknown>;
      }
    >;
  };

  assert.deepEqual(Object.keys(template.Parameters), ['PurposeConfirmation']);
  assert.deepEqual(Object.keys(template.Resources), [
    'MigrationAcceptanceTable',
  ]);

  const table = template.Resources.MigrationAcceptanceTable;
  assert.equal(table.Type, 'AWS::DynamoDB::Table');
  assert.equal(table.DeletionPolicy, 'Delete');
  assert.equal(table.UpdateReplacePolicy, 'Delete');
  assert.deepEqual(table.Properties.AttributeDefinitions, [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
  ]);
  assert.deepEqual(table.Properties.KeySchema, [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' },
  ]);
  assert.equal(table.Properties.BillingMode, 'PAY_PER_REQUEST');
  assert.equal(table.Properties.TableClass, 'STANDARD');
  assert.equal(table.Properties.DeletionProtectionEnabled, false);
  assert.deepEqual(table.Properties.PointInTimeRecoverySpecification, {
    PointInTimeRecoveryEnabled: false,
  });
  assert.deepEqual(table.Properties.TimeToLiveSpecification, {
    AttributeName: 'expiresAt',
    Enabled: true,
  });
  assert.equal('TableName' in table.Properties, false);
});
