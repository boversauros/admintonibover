import { NextRequest } from 'next/server';

import { handleAwsAdminRead } from '@/lib/aws/admin-read-route';
import { proxyAwsAdminApi } from '@/lib/aws/admin-api-proxy';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id } = await params;
  return handleAwsAdminRead(request, client => client.getPost(id));
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id } = await params;
  return proxyAwsAdminApi(request, `posts/${encodeURIComponent(id)}`, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id } = await params;
  return proxyAwsAdminApi(request, `posts/${encodeURIComponent(id)}`, 'DELETE');
}
