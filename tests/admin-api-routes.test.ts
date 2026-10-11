import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDevFoundationTemplate,
  createProductionFoundationTemplate,
} from '../infra/dev-foundation';
import { ADMIN_API_ROUTES, findRoute } from '../lib/aws/admin-api/routes';

function deployedRouteKeys(
  template: ReturnType<typeof createDevFoundationTemplate>
): string[] {
  return Object.values(template.Resources)
    .filter(resource => resource.Type === 'AWS::ApiGatewayV2::Route')
    .map(resource => String(resource.Properties?.RouteKey))
    .sort();
}

test('admin API route table matches the API Gateway routes in both foundations', () => {
  const handled = Object.keys(ADMIN_API_ROUTES).sort();
  assert.deepEqual(deployedRouteKeys(createDevFoundationTemplate()), handled);
  assert.deepEqual(
    deployedRouteKeys(createProductionFoundationTemplate()),
    handled
  );
});

test('admin API route lookup ignores prototype keys', () => {
  assert.equal(findRoute('constructor'), undefined);
  assert.equal(findRoute('__proto__'), undefined);
  assert.equal(findRoute('toString'), undefined);
  assert.equal(typeof findRoute('GET /health'), 'function');
});
