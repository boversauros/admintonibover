import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import {
  EXACT_ADMIN_ORIGIN_PATTERN,
  EXACT_CALLBACK_URL_PATTERN,
  EXACT_LOGOUT_URL_PATTERN,
  EXPECTED_RESOURCE_TYPE_COUNTS,
  FOUNDATION_LAMBDA_CODE,
  LEGACY_FOUNDATION_LAMBDA_CODE,
  createDevFoundationTemplate,
} from '../infra/dev-foundation';
import { validateDevFoundationTemplate } from '../infra/validate-dev-foundation';

type FoundationResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type FoundationHandler = (
  event: Record<string, unknown>
) => Promise<FoundationResponse>;

type DynamoInput = {
  TableName?: string;
  Key?: {
    PK?: { S?: string };
    SK?: { S?: string };
  };
  ConsistentRead?: boolean;
};

type DynamoSend = (
  input: DynamoInput
) => Promise<{ Item?: Record<string, unknown> }>;

function loadFoundationHandler({
  send = async () => ({}),
  logs = [],
}: {
  send?: DynamoSend;
  logs?: string[];
} = {}): FoundationHandler {
  class FakeGetItemCommand {
    input: DynamoInput;

    constructor(input: DynamoInput) {
      this.input = input;
    }
  }

  class FakeDynamoDBClient {
    send(command: FakeGetItemCommand) {
      return send(command.input);
    }
  }

  const context: {
    console: Pick<Console, 'error' | 'info' | 'warn'>;
    exports: { handler?: FoundationHandler };
    process: NodeJS.Process;
    require: (specifier: string) => unknown;
  } = {
    console: {
      error: value => logs.push(String(value)),
      info: value => logs.push(String(value)),
      warn: value => logs.push(String(value)),
    },
    exports: {},
    process,
    require: specifier => {
      assert.equal(specifier, '@aws-sdk/client-dynamodb');
      return {
        DynamoDBClient: FakeDynamoDBClient,
        GetItemCommand: FakeGetItemCommand,
      };
    },
  };
  runInNewContext(LEGACY_FOUNDATION_LAMBDA_CODE, context);

  const handler = context.exports.handler;
  if (typeof handler !== 'function') {
    throw new Error('Foundation handler failed to load');
  }
  return handler;
}

function authorizedEvent(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    routeKey: 'GET /health',
    requestContext: {
      requestId: 'accepted',
      authorizer: {
        jwt: {
          claims: {
            iss: process.env.EXPECTED_ISSUER,
            client_id: process.env.EXPECTED_CLIENT_ID,
            token_use: 'access',
            sub: 'admin-subject',
            scope: 'openid admintonibover-api/admin',
          },
        },
      },
    },
    ...overrides,
  };
}

function parseBody(response: FoundationResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

function tracerItem() {
  return {
    PK: { S: 'POST#issue-9-fixture' },
    SK: { S: 'POST#issue-9-fixture' },
    id: { S: 'issue-9-fixture' },
    translations: {
      M: {
        ca: { M: { title: { S: 'Una primera lectura a DynamoDB' } } },
        en: { M: { title: { S: 'A first DynamoDB read' } } },
      },
    },
    migration: {
      M: {
        source: { S: 'issue-9-fixture' },
        status: { S: 'ready' },
      },
    },
  };
}

test('development foundation passes the offline safety contract', () => {
  const template = createDevFoundationTemplate();
  const summary = validateDevFoundationTemplate(template);

  assert.equal(summary.resourceCount, 36);
  assert.deepEqual(summary.resourceTypes, EXPECTED_RESOURCE_TYPE_COUNTS);
});

test('generated Lambda bundle stays inline-safe and enforces claims', async () => {
  assert.equal(
    Buffer.byteLength(FOUNDATION_LAMBDA_CODE, 'utf8') < 900_000,
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
  process.env.REQUIRED_ADMIN_SCOPE = 'admintonibover-api/admin';
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
});

test('committed CloudFormation synthesis is deterministic and current', async () => {
  const committed = await readFile(
    new URL('../infra/generated/dev-foundation.template.json', import.meta.url),
    'utf8'
  );
  const expected = `${JSON.stringify(createDevFoundationTemplate(), null, 2)}\n`;

  assert.equal(committed, expected);
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

test('foundation Lambda rejects missing or incorrect defense-in-depth claims', async () => {
  let reads = 0;
  const handler = loadFoundationHandler({
    send: async () => {
      reads += 1;
      return {};
    },
  });

  process.env.EXPECTED_ISSUER = 'https://issuer.example.invalid/pool';
  process.env.EXPECTED_CLIENT_ID = 'public-client';
  process.env.REQUIRED_ADMIN_SCOPE = 'admintonibover-api/admin';

  const missing = await handler({
    requestContext: { requestId: 'missing' },
  });
  assert.equal(missing.statusCode, 403);
  assert.equal(reads, 0);

  const wrongScope = await handler({
    requestContext: {
      requestId: 'wrong-scope',
      authorizer: {
        jwt: {
          claims: {
            iss: process.env.EXPECTED_ISSUER,
            client_id: process.env.EXPECTED_CLIENT_ID,
            token_use: 'access',
            sub: 'admin-subject',
            scope: 'openid',
          },
        },
      },
    },
  });
  assert.equal(wrongScope.statusCode, 403);
  assert.equal(reads, 0);
});

test('foundation Lambda accepts the exact protected admin claims', async () => {
  const handler = loadFoundationHandler();

  process.env.EXPECTED_ISSUER = 'https://issuer.example.invalid/pool';
  process.env.EXPECTED_CLIENT_ID = 'public-client';
  process.env.REQUIRED_ADMIN_SCOPE = 'admintonibover-api/admin';

  const result = await handler(authorizedEvent());

  assert.equal(result.statusCode, 200);
  assert.deepEqual(parseBody(result), {
    version: 1,
    data: { status: 'ok' },
    requestId: 'accepted',
  });
});

test('post read validates the ID before making a DynamoDB request', async () => {
  let reads = 0;
  const handler = loadFoundationHandler({
    send: async () => {
      reads += 1;
      return {};
    },
  });

  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  const result = await handler(
    authorizedEvent({
      routeKey: 'GET /posts/{id}',
      pathParameters: { id: 'contains spaces' },
    })
  );

  assert.equal(result.statusCode, 400);
  assert.equal(reads, 0);
  assert.deepEqual(parseBody(result), {
    version: 1,
    error: {
      code: 'BAD_REQUEST',
      message: 'Post ID is malformed',
    },
    requestId: 'accepted',
  });
});

test('post read uses a strong exact-key read and returns 404 for an unknown post', async () => {
  const inputs: DynamoInput[] = [];
  const handler = loadFoundationHandler({
    send: async input => {
      inputs.push(input);
      return {};
    },
  });

  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  const result = await handler(
    authorizedEvent({
      routeKey: 'GET /posts/{id}',
      pathParameters: { id: 'unknown-post' },
    })
  );

  assert.equal(result.statusCode, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(inputs)), [
    {
      TableName: 'fixture-table',
      Key: {
        PK: { S: 'POST#unknown-post' },
        SK: { S: 'POST#unknown-post' },
      },
      ConsistentRead: true,
    },
  ]);
  assert.deepEqual(parseBody(result), {
    version: 1,
    error: { code: 'NOT_FOUND', message: 'Post not found' },
    requestId: 'accepted',
  });
});

test('post read returns only the tracer projection and correlation data', async () => {
  const logs: string[] = [];
  const handler = loadFoundationHandler({
    send: async () => ({ Item: tracerItem() }),
    logs,
  });

  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  const result = await handler(
    authorizedEvent({
      routeKey: 'GET /posts/{id}',
      headers: { 'x-correlation-id': 'browser-request-9' },
      pathParameters: { id: 'issue-9-fixture' },
    })
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['x-correlation-id'], 'browser-request-9');
  assert.deepEqual(parseBody(result), {
    version: 1,
    data: {
      id: 'issue-9-fixture',
      title: 'Una primera lectura a DynamoDB',
      migration: {
        source: 'issue-9-fixture',
        status: 'ready',
      },
    },
    requestId: 'browser-request-9',
  });
  assert.equal(
    logs.some(log => log.includes('Una primera lectura')),
    false
  );
});

test('post read returns a stable 500 without logging content or tokens', async () => {
  const logs: string[] = [];
  const handler = loadFoundationHandler({
    send: async () => {
      const error = new Error('secret fixture content');
      error.name = 'ServiceUnavailable';
      throw error;
    },
    logs,
  });

  process.env.CONTENT_TABLE_NAME = 'fixture-table';
  const result = await handler(
    authorizedEvent({
      routeKey: 'GET /posts/{id}',
      pathParameters: { id: 'issue-9-fixture' },
    })
  );

  assert.equal(result.statusCode, 500);
  assert.deepEqual(parseBody(result), {
    version: 1,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The post could not be loaded',
    },
    requestId: 'accepted',
  });
  assert.equal(
    logs.some(log => log.includes('secret fixture content')),
    false
  );
  assert.equal(
    logs.some(log => log.includes('eyJ')),
    false
  );
});
