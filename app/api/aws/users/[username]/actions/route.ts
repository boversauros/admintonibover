import { NextRequest } from 'next/server';
import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

type UserRouteContext = { params: Promise<{ username: string }> };

export async function POST(
  request: NextRequest,
  context: UserRouteContext
): Promise<Response> {
  const { username } = await context.params;
  return proxyAwsAdminApi(
    request,
    `users/${encodeURIComponent(username)}/actions`,
    'POST'
  );
}
