import { NextResponse } from 'next/server';

import { getCognitoConfig } from '@/lib/auth/cognito/config';
import { setCognitoTransientCookies } from '@/lib/auth/cognito/cookies';
import { createPkceArtifacts } from '@/lib/auth/cognito/oauth';
import { getAdminDataBackend } from '@/lib/config/adminBackend';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (getAdminDataBackend() !== 'aws') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const artifacts = createPkceArtifacts(getCognitoConfig());
  const response = NextResponse.redirect(artifacts.authorizeUrl);
  setCognitoTransientCookies(response, artifacts);
  return response;
}
