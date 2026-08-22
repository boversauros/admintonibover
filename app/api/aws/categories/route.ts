import { NextRequest } from 'next/server';

import { handleAwsAdminRead } from '@/lib/aws/admin-read-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return handleAwsAdminRead(request, client => client.listCategories());
}
