import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import {
  EXPECTED_RESOURCE_TYPE_COUNTS,
  FOUNDATION_LAMBDA_CODE,
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
  runInNewContext(FOUNDATION_LAMBDA_CODE, context);

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

  assert.equal(summary.resourceCount, 18);
  assert.deepEqual(summary.resourceTypes, EXPECTED_RESOURCE_TYPE_COUNTS);
});

test('committed CloudFormation synthesis is deterministic and current', async () => {
  const committed = await readFile(
    new URL('../infra/generated/dev-foundation.template.json', import.meta.url),
    'utf8'
  );
  const expected = `${JSON.stringify(createDevFoundationTemplate(), null, 2)}\n`;

  assert.equal(committed, expected);
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
