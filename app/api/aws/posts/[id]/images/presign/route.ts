import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id } = await params;
  return proxyAwsAdminApi(
    request,
    `posts/${encodeURIComponent(id)}/images/presign`,
    'POST'
  );
}
