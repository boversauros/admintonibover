import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  EXACT_ADMIN_ORIGIN_PATTERN,
  EXACT_CALLBACK_URL_PATTERN,
  EXACT_LOGOUT_URL_PATTERN,
  EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN,
  EXACT_PRODUCTION_CALLBACK_URL_PATTERN,
  EXACT_PRODUCTION_LOGOUT_URL_PATTERN,
  EXPECTED_RESOURCE_TYPE_COUNTS,
  FOUNDATION_LAMBDA_CODE,
  createDevFoundationTemplate,
  createProductionFoundationTemplate,
} from '../infra/dev-foundation';
import {
  validateDevFoundationTemplate,
  validateProductionFoundationTemplate,
} from '../infra/validate-dev-foundation';

type FoundationResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type FoundationHandler = (
  event: Record<string, unknown>
) => Promise<FoundationResponse>;

test('development foundation passes the offline safety contract', () => {
  const template = createDevFoundationTemplate();
  const summary = validateDevFoundationTemplate(template);

  assert.equal(summary.resourceCount, 42);
  assert.deepEqual(summary.resourceTypes, EXPECTED_RESOURCE_TYPE_COUNTS);
});

test('production foundation is isolated and retains data-bearing resources', () => {
  const template = createProductionFoundationTemplate();
  const summary = validateProductionFoundationTemplate(template);

  assert.equal(summary.resourceCount, 42);
  assert.deepEqual(summary.resourceTypes, EXPECTED_RESOURCE_TYPE_COUNTS);
  assert.deepEqual(template.Parameters.Environment.AllowedValues, ['prod']);
  assert.equal(template.Parameters.EnableTableDeletionProtection, undefined);

  for (const [logicalId, deletionPolicy] of [
    ['ContentTable', 'Retain'],
    ['ContentBucket', 'RetainExceptOnCreate'],
    ['UserPool', 'Retain'],
  ] as const) {
    assert.equal(template.Resources[logicalId].DeletionPolicy, deletionPolicy);
    assert.equal(template.Resources[logicalId].UpdateReplacePolicy, 'Retain');
  }

  assert.equal(
    template.Resources.UserPool.Properties!.DeletionProtection,
    'ACTIVE'
  );
});

test('generated Lambda bundle stays inline-safe and enforces claims', async () => {
  assert.equal(
    Buffer.byteLength(FOUNDATION_LAMBDA_CODE, 'utf8') < 950_000,
    true
  );
  const generated = createRequire(import.meta.url)(
    '../infra/generated/foundation-lambda.cjs'
  ) as { handler?: FoundationHandler };
  assert.equal(typeof generated.handler, 'function');
  assert.equal(
    FOUNDATION_LAMBDA_CODE.includes('POST /posts/{id}/images/confirm'),
    true
  );
  assert.equal(
    FOUNDATION_LAMBDA_CODE.includes('DELETE /posts/{id}/images/{role}'),
    true
  );
  assert.equal(FOUNDATION_LAMBDA_CODE.includes('X-Amz-Signature='), false);
  process.env.EXPECTED_ISSUER = 'https://issuer.example.invalid/pool';
  process.env.EXPECTED_CLIENT_ID = 'public-client';
  process.env.USER_POOL_ID = 'eu-west-1_fixture-pool';
  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  process.env.CONTENT_BUCKET_NAME = 'fixture-bucket';
  process.env.BACKUP_ENVIRONMENT = 'dev';
  const denied = await generated.handler!({
    routeKey: 'POST /posts/{id}/images/presign',
    pathParameters: { id: 'post-1' },
    body: '{}',
    requestContext: { requestId: 'generated-denial' },
  });
  assert.equal(denied.statusCode, 401);

  const ungrouped = await generated.handler!({
    routeKey: 'GET /health',
    requestContext: {
      requestId: 'generated-ungrouped',
      authorizer: {
        jwt: {
          claims: {
            iss: process.env.EXPECTED_ISSUER,
            client_id: process.env.EXPECTED_CLIENT_ID,
            token_use: 'access',
            sub: 'ungrouped-subject',
          },
        },
      },
    },
  });
  assert.equal(ungrouped.statusCode, 403);

  const editor = await generated.handler!({
    routeKey: 'GET /health',
    requestContext: {
      requestId: 'generated-editor',
      authorizer: {
        jwt: {
          claims: {
            iss: process.env.EXPECTED_ISSUER,
            client_id: process.env.EXPECTED_CLIENT_ID,
            token_use: 'access',
            sub: 'editor-subject',
            'cognito:groups': ['editors'],
          },
        },
      },
    },
  });
  assert.equal(editor.statusCode, 200);
});

test('committed CloudFormation syntheses are deterministic and current', async () => {
  for (const [filename, createTemplate] of [
    ['dev-foundation.template.json', createDevFoundationTemplate],
    ['prod-foundation.template.json', createProductionFoundationTemplate],
  ] as const) {
    const committed = await readFile(
      new URL(`../infra/generated/${filename}`, import.meta.url),
      'utf8'
    );
    const expected = `${JSON.stringify(createTemplate(), null, 2)}\n`;

    assert.equal(committed, expected);
  }
});

test('example Cognito URLs use exact callback paths and matching origins', async () => {
  const parameters = JSON.parse(
    await readFile(
      new URL('../infra/parameters/dev.example.json', import.meta.url),
      'utf8'
    )
  ) as Array<{ ParameterKey: string; ParameterValue: string }>;
  const parameterValues = Object.fromEntries(
    parameters.map(({ ParameterKey, ParameterValue }) => [
      ParameterKey,
      ParameterValue,
    ])
  );
  const callbackUrls = parameterValues.CallbackUrls?.split(',') ?? [];
  const logoutUrls = parameterValues.LogoutUrls?.split(',') ?? [];
  const allowedOrigins = parameterValues.AllowedOrigins?.split(',') ?? [];
  const originPattern = new RegExp(EXACT_ADMIN_ORIGIN_PATTERN);
  const callbackPattern = new RegExp(EXACT_CALLBACK_URL_PATTERN);
  const logoutPattern = new RegExp(EXACT_LOGOUT_URL_PATTERN);

  assert.equal(logoutUrls.length, callbackUrls.length);
  assert.equal(allowedOrigins.length, callbackUrls.length);
  assert.equal(callbackUrls.length > 0, true);
  assert.equal(
    allowedOrigins.every(value => originPattern.test(value)),
    true
  );
  assert.equal(
    callbackUrls.every(value => callbackPattern.test(value)),
    true
  );
  assert.equal(
    logoutUrls.every(value => logoutPattern.test(value)),
    true
  );
  assert.equal(
    callbackUrls.every(
      (value, index) =>
        new URL(value).pathname === '/auth/callback' &&
        new URL(value).origin === new URL(logoutUrls[index]).origin &&
        new URL(logoutUrls[index]).pathname === '/'
    ),
    true
  );
  assert.equal(originPattern.test('https://*.example.com'), false);
  assert.equal(originPattern.test('https://admin.example.com/path'), false);
  assert.equal(callbackPattern.test('https://admin.example.com/other'), false);
  assert.equal(logoutPattern.test('https://admin.example.com/*'), false);
});

test('production example requires HTTPS-only exact matching origins', async () => {
  const parameters = JSON.parse(
    await readFile(
      new URL('../infra/parameters/prod.example.json', import.meta.url),
      'utf8'
    )
  ) as Array<{ ParameterKey: string; ParameterValue: string }>;
  const values = Object.fromEntries(
    parameters.map(({ ParameterKey, ParameterValue }) => [
      ParameterKey,
      ParameterValue,
    ])
  );
  const allowedOrigins = values.AllowedOrigins?.split(',') ?? [];
  const callbackUrls = values.CallbackUrls?.split(',') ?? [];
  const logoutUrls = values.LogoutUrls?.split(',') ?? [];
  const originPattern = new RegExp(EXACT_PRODUCTION_ADMIN_ORIGIN_PATTERN);
  const callbackPattern = new RegExp(EXACT_PRODUCTION_CALLBACK_URL_PATTERN);
  const logoutPattern = new RegExp(EXACT_PRODUCTION_LOGOUT_URL_PATTERN);

  assert.equal(values.Environment, 'prod');
  assert.equal(allowedOrigins.length, callbackUrls.length);
  assert.equal(callbackUrls.length, logoutUrls.length);
  assert.equal(
    allowedOrigins.every(value => originPattern.test(value)),
    true
  );
  assert.equal(
    callbackUrls.every(value => callbackPattern.test(value)),
    true
  );
  assert.equal(
    logoutUrls.every(value => logoutPattern.test(value)),
    true
  );
  assert.equal(originPattern.test('http://localhost:3000'), false);
  assert.equal(originPattern.test('https://localhost:3000'), false);
  assert.equal(originPattern.test('https://127.0.0.1'), false);
  assert.equal(originPattern.test('https://*.example.com'), false);
  assert.equal(
    callbackUrls.every(
      (value, index) =>
        new URL(value).pathname === '/auth/callback' &&
        new URL(value).origin === new URL(logoutUrls[index]).origin
    ),
    true
  );
});

test('production validation rejects destructive retention or relaxed isolation', () => {
  const destructiveTable = createProductionFoundationTemplate();
  destructiveTable.Resources.ContentTable.DeletionPolicy = 'Delete';
  assert.throws(() => validateProductionFoundationTemplate(destructiveTable));

  const disabledProtection = createProductionFoundationTemplate();
  disabledProtection.Resources.ContentTable.Properties!.DeletionProtectionEnabled = false;
  assert.throws(() => validateProductionFoundationTemplate(disabledProtection));

  const developmentEnvironment = createProductionFoundationTemplate();
  developmentEnvironment.Parameters.Environment.AllowedValues = ['dev'];
  assert.throws(() =>
    validateProductionFoundationTemplate(developmentEnvironment)
  );

  const localhostOrigins = createProductionFoundationTemplate();
  localhostOrigins.Parameters.AllowedOrigins.AllowedPattern =
    EXACT_ADMIN_ORIGIN_PATTERN;
  assert.throws(() => validateProductionFoundationTemplate(localhostOrigins));
});

test('offline validation rejects public storage and credentialed API CORS', () => {
  const publicBucket = createDevFoundationTemplate();
  const policy = publicBucket.Resources.ContentBucketPolicy.Properties!
    .PolicyDocument as { Statement: unknown[] };
  policy.Statement.push({
    Effect: 'Allow',
    Principal: '*',
    Action: 's3:GetObject',
    Resource: '*',
  });
  assert.throws(() => validateDevFoundationTemplate(publicBucket));

  const credentialedApi = createDevFoundationTemplate();
  const api = credentialedApi.Resources.HttpApi.Properties!;
  (api.CorsConfiguration as Record<string, unknown>).AllowCredentials = true;
  assert.throws(() => validateDevFoundationTemplate(credentialedApi));
});
