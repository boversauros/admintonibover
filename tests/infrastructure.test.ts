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

type FoundationHandler = (
  event: Record<string, unknown>
) => Promise<{ statusCode: number }>;

function loadFoundationHandler(): FoundationHandler {
  const context: {
    console: Pick<Console, 'info' | 'warn'>;
    exports: { handler?: FoundationHandler };
    process: NodeJS.Process;
  } = {
    console: {
      info: () => undefined,
      warn: () => undefined,
    },
    exports: {},
    process,
  };
  runInNewContext(FOUNDATION_LAMBDA_CODE, context);

  const handler = context.exports.handler;
  if (typeof handler !== 'function') {
    throw new Error('Foundation handler failed to load');
  }
  return handler;
}

test('development foundation passes the offline safety contract', () => {
  const template = createDevFoundationTemplate();
  const summary = validateDevFoundationTemplate(template);

  assert.equal(summary.resourceCount, 16);
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
  const handler = loadFoundationHandler();

  process.env.EXPECTED_ISSUER = 'https://issuer.example.invalid/pool';
  process.env.EXPECTED_CLIENT_ID = 'public-client';
  process.env.REQUIRED_ADMIN_SCOPE = 'admintonibover-api/admin';

  const missing = await handler({
    requestContext: { requestId: 'missing' },
  });
  assert.equal(missing.statusCode, 403);

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
});

test('foundation Lambda accepts the exact protected admin claims', async () => {
  const handler = loadFoundationHandler();

  process.env.EXPECTED_ISSUER = 'https://issuer.example.invalid/pool';
  process.env.EXPECTED_CLIENT_ID = 'public-client';
  process.env.REQUIRED_ADMIN_SCOPE = 'admintonibover-api/admin';

  const result = await handler({
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
  });

  assert.equal(result.statusCode, 200);
});
