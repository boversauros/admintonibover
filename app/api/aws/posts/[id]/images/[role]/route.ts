import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string; role: string }> };

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id, role } = await params;
  return proxyAwsAdminApi(
    request,
    `posts/${encodeURIComponent(id)}/images/${encodeURIComponent(role)}`,
    'DELETE'
  );
}
