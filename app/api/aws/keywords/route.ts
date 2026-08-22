import { NextRequest } from 'next/server';

import { handleAwsAdminRead } from '@/lib/aws/admin-read-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const language = request.nextUrl.searchParams.get('language');
  return handleAwsAdminRead(request, client =>
    client.listKeywords(
      language === 'ca' || language === 'en' ? language : undefined
    )
  );
}
