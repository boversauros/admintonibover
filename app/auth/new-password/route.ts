import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { COGNITO_COOKIE_NAMES } from '@/lib/auth/cognito/cookies';
import { handleNewPassword } from '@/lib/auth/cognito/in-app-flow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const sealed = (await cookies()).get(
    COGNITO_COOKIE_NAMES.newPasswordChallenge
  )?.value;
  return handleNewPassword(request, getCognitoConfig(), sealed);
}
