import { NextRequest } from 'next/server';

import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'posts/publication/bulk', 'POST');
}
