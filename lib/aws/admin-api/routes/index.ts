import type { RouteHandler } from '../context';
import { response } from '../http';
import { backupRoutes } from './backup';
import { mediaRoutes } from './media';
import { postRoutes } from './posts';
import { taxonomyRoutes } from './taxonomy';
import { userRoutes } from './users';

const health: RouteHandler = async ({ requestId }) =>
  response(200, { data: { status: 'ok' } }, requestId);

/**
 * Every API Gateway route key served by the admin Lambda. Adding a route means
 * one entry here (via its resource module) plus the matching protected route in
 * infra/dev-foundation.ts; tests/admin-api-routes.test.ts keeps the two in sync.
 */
export const ADMIN_API_ROUTES = {
  'GET /health': health,
  ...postRoutes,
  ...mediaRoutes,
  ...taxonomyRoutes,
  ...backupRoutes,
  ...userRoutes,
} satisfies Record<string, RouteHandler>;

export type AdminApiRouteKey = keyof typeof ADMIN_API_ROUTES;

export function findRoute(routeKey: string): RouteHandler | undefined {
  // Own-property check so prototype keys such as "constructor" stay a 404.
  return Object.hasOwn(ADMIN_API_ROUTES, routeKey)
    ? ADMIN_API_ROUTES[routeKey as AdminApiRouteKey]
    : undefined;
}
