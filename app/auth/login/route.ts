import type { NextRequest } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { handleInAppSignIn } from '@/lib/auth/cognito/in-app-flow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  return handleInAppSignIn(request, getCognitoConfig());
}
