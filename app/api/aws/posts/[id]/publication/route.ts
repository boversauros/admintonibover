import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';
// Room for the AWS call plus the background site rebuild hook (~10 s).
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id } = await params;
  return proxyAwsAdminApi(
    request,
    `posts/${encodeURIComponent(id)}/publication`,
    'PUT',
    { siteRebuild: 'always' }
  );
}
