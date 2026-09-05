import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'backup', 'GET');
}
