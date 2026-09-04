import { NextRequest } from 'next/server';

import { handleAwsAdminRead } from '@/lib/aws/admin-read-route';
import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';
import { parseAdminPostListSearchParams } from '@/lib/aws/admin-post-list-query';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return handleAwsAdminRead(request, client =>
    client.listPosts(
      parseAdminPostListSearchParams(request.nextUrl.searchParams)
    )
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'posts', 'POST');
}
