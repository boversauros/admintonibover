import type { NextRequest } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { handleConfirmPassword } from '@/lib/auth/cognito/in-app-flow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  return handleConfirmPassword(request, getCognitoConfig());
}
