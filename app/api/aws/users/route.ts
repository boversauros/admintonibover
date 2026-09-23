import { NextRequest } from 'next/server';
import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const cursor = request.nextUrl.searchParams.get('cursor');
  const path = cursor ? `users?${new URLSearchParams({ cursor })}` : 'users';
  return proxyAwsAdminApi(request, path, 'GET');
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxyAwsAdminApi(request, 'users', 'POST');
}
