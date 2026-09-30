import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createProductionSiteReaderTemplate } from '../infra/production-site-reader';

test('production reader stack cannot replace existing data or admin resources', async () => {
  const template = createProductionSiteReaderTemplate();
  assert.deepEqual(
    Object.values(template.Resources)
      .map(resource => resource.Type)
      .sort(),
    [
      'AWS::IAM::Role',
      'AWS::IAM::Role',
      'AWS::Lambda::Function',
      'AWS::Logs::LogGroup',
    ]
  );
  assert.equal(template.Parameters.Environment, undefined);
  const reader = template.Resources.ReaderFunction.Properties!;
  assert.deepEqual(reader.Environment, {
    Variables: {
      CONTENT_TABLE_NAME: { Ref: 'ProductionContentTableName' },
      CONTENT_BUCKET_NAME: { Ref: 'ProductionContentBucketName' },
      READER_ENVIRONMENT: 'prod',
    },
  });
  assert.deepEqual(reader.Code, {
    S3Bucket: { Ref: 'ProductionContentBucketName' },
    S3Key: { Ref: 'ReaderCodeObjectKey' },
  });
  assert.equal(reader.VpcConfig, undefined);
  assert.equal(reader.ReservedConcurrentExecutions, undefined);
  assert.equal(
    template.Resources.ReaderLogGroup.Properties!.RetentionInDays,
    14
  );
  for (const parameter of Object.values(template.Parameters)) {
    assert.equal('Default' in parameter, false);
  }
  assert.deepEqual(
    JSON.parse(
      await readFile(
        'infra/generated/production-site-reader.template.json',
        'utf8'
      )
    ),
    template
  );
});

test('execution role is read-only and Preview has only exact-function invoke access', () => {
  const template = createProductionSiteReaderTemplate();
  const execution = template.Resources.ReaderExecutionRole.Properties!
    .Policies as {
    PolicyDocument: { Statement: { Action: string[]; Resource: unknown }[] };
  }[];
  const statements = execution[0].PolicyDocument.Statement;
  assert.deepEqual(statements.flatMap(statement => statement.Action).sort(), [
    'dynamodb:GetItem',
    'dynamodb:Query',
    'logs:CreateLogStream',
    'logs:PutLogEvents',
    's3:GetObject',
  ]);
  assert.deepEqual(statements[0].Resource, {
    'Fn::GetAtt': ['ReaderLogGroup', 'Arn'],
  });
  assert.deepEqual(statements[1].Resource, {
    'Fn::Sub':
      'arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${ProductionContentTableName}',
  });
  assert.deepEqual(statements[2].Resource, {
    'Fn::Sub':
      'arn:${AWS::Partition}:s3:::${ProductionContentBucketName}/images/posts/*',
  });
  assert.deepEqual(
    template.Resources.ReaderPreviewInvokeRole.Properties!.Policies,
    [
      {
        PolicyName: 'invoke-exact-production-reader',
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['lambda:InvokeFunction'],
              Resource: { 'Fn::GetAtt': ['ReaderFunction', 'Arn'] },
            },
          ],
        },
      },
    ]
  );
});

test('Preview trust reuses the same-account provider and requires exact project/audience/environment', () => {
  const template = createProductionSiteReaderTemplate();
  const trust = template.Resources.ReaderPreviewInvokeRole.Properties!
    .AssumeRolePolicyDocument as { 'Fn::Sub': string };
  const values: Record<string, string> = {
    'AWS::Partition': 'aws',
    'AWS::AccountId': '123456789012',
    VercelTeamSlug: 'fixture-team',
    VercelSiteProjectName: 'fixture-site',
  };
  const resolved = JSON.parse(
    trust['Fn::Sub'].replace(
      /\$\{([^}]+)\}/g,
      (_, name: string) => values[name]
    )
  );
  assert.deepEqual(resolved.Statement, [
    {
      Effect: 'Allow',
      Principal: {
        Federated:
          'arn:aws:iam::123456789012:oidc-provider/oidc.vercel.com/fixture-team',
      },
      Action: 'sts:AssumeRoleWithWebIdentity',
      Condition: {
        StringEquals: {
          'oidc.vercel.com/fixture-team:aud': 'https://vercel.com/fixture-team',
          'oidc.vercel.com/fixture-team:sub':
            'owner:fixture-team:project:fixture-site:environment:preview',
        },
      },
    },
  ]);
  assert.equal(JSON.stringify(template).includes('StringLike'), false);
  assert.equal(template.Resources.VercelOidcProvider, undefined);
});

test('packaged Lambda initializes for prod and fails closed for a wrong request environment', () => {
  const script = `
    const { handler } = require('./infra/generated/build-reader-lambda.cjs');
    handler({ version: 1, environment: 'dev', operation: 'revision' })
      .then(value => process.stdout.write(JSON.stringify(value)))
      .catch(() => process.exit(1));
  `;
  const output = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AWS_REGION: 'eu-west-1',
      READER_ENVIRONMENT: 'prod',
      CONTENT_TABLE_NAME: 'fixture-table',
      CONTENT_BUCKET_NAME: 'fixture-bucket',
    },
  });
  assert.deepEqual(JSON.parse(output), {
    version: 1,
    environment: 'prod',
    ok: false,
    error: { code: 'INVALID_REQUEST', retryable: false },
  });
});
