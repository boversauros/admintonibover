import { NextRequest } from 'next/server';

import { handleAwsAdminRead } from '@/lib/aws/admin-read-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const query = request.nextUrl.searchParams;
  const limit = Number(query.get('limit') ?? '10');
  const direction = query.get('direction');
  const published = query.get('published');

  return handleAwsAdminRead(request, client =>
    client.listPosts({
      limit,
      ...(query.get('cursor')
        ? { cursor: query.get('cursor') ?? undefined }
        : {}),
      ...(direction === 'ascending' || direction === 'descending'
        ? { direction }
        : {}),
      ...(query.get('title') ? { title: query.get('title') ?? undefined } : {}),
      ...(published === 'true' || published === 'false'
        ? { published: published === 'true' }
        : {}),
      ...(query.get('categoryId')
        ? { categoryId: query.get('categoryId') ?? undefined }
        : {}),
    })
  );
}
