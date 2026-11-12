import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';
// Room for the AWS call plus the background site rebuild hook (~10 s).
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'posts', 'GET');
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'posts', 'POST', {
    siteRebuild: 'ifPublished',
  });
}
