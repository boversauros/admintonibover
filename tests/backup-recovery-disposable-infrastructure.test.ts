import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const templatePath = new URL(
  '../infra/backup-recovery-disposable-table.template.json',
  import.meta.url
);

test('backup recovery IaC creates one run-tagged disposable development table', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8')) as {
    Parameters: Record<
      string,
      { AllowedValues?: string[]; AllowedPattern?: string }
    >;
    Resources: Record<
      string,
      {
        Type: string;
        DeletionPolicy?: string;
        UpdateReplacePolicy?: string;
        Properties: Record<string, unknown> & {
          Tags: Array<{ Key: string; Value: unknown }>;
        };
      }
    >;
  };

  assert.deepEqual(Object.keys(template.Resources), ['RecoveryTable']);
  assert.deepEqual(template.Parameters.PurposeConfirmation.AllowedValues, [
    'ISSUE-23-BACKUP-RESTORE',
  ]);
  assert.equal(
    template.Parameters.RecoveryRunId.AllowedPattern,
    '^issue-23-[a-z0-9-]{8,40}$'
  );

  const table = template.Resources.RecoveryTable;
  assert.equal(table.Type, 'AWS::DynamoDB::Table');
  assert.equal(table.DeletionPolicy, 'Delete');
  assert.equal(table.UpdateReplacePolicy, 'Delete');
  assert.equal(table.Properties.BillingMode, 'PAY_PER_REQUEST');
  assert.equal(table.Properties.DeletionProtectionEnabled, false);
  assert.deepEqual(table.Properties.KeySchema, [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' },
  ]);
  assert.deepEqual(table.Properties.AttributeDefinitions, [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
  ]);
  assert.equal('TableName' in table.Properties, false);
  assert.deepEqual(
    table.Properties.Tags.find(tag => tag.Key === 'Purpose')?.Value,
    { Ref: 'PurposeConfirmation' }
  );
  assert.deepEqual(
    table.Properties.Tags.find(tag => tag.Key === 'RecoveryRunId')?.Value,
    { Ref: 'RecoveryRunId' }
  );
});
