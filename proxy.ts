import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  getAdminDataBackend,
  type AdminDataBackend,
} from '@/lib/config/adminBackend';

type SecurityEnvironment = {
  ADMIN_CSP_MODE?: string;
  AWS_CONTENT_BUCKET_ORIGIN?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NODE_ENV?: string;
};

export type CspMode = 'enforce' | 'report-only';

function exactOrigin(
  name: string,
  value: string | undefined,
  allowDevelopmentLoopback: boolean,
  environment: SecurityEnvironment
): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  if (normalized.includes('*')) {
    throw new Error(`${name} must not contain a wildcard`);
  }

  const url = new URL(normalized);
  const isDevelopmentLoopback =
    environment.NODE_ENV !== 'production' &&
    allowDevelopmentLoopback &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !isDevelopmentLoopback) {
    throw new Error(`${name} must use HTTPS except for local development`);
  }
  if (
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${name} must be an exact origin without a path`);
  }
  return url.origin;
}

function cspMode(value: string | undefined): CspMode {
  if (value === undefined || value === '' || value === 'enforce') {
    return 'enforce';
  }
  if (value === 'report-only') return 'report-only';
  throw new Error('ADMIN_CSP_MODE must be enforce or report-only');
}

function activeBackendSources(
  backend: AdminDataBackend,
  environment: SecurityEnvironment
): { connect: string[]; images: string[] } {
  if (backend === 'aws') {
    const s3Origin = exactOrigin(
      'AWS_CONTENT_BUCKET_ORIGIN',
      environment.AWS_CONTENT_BUCKET_ORIGIN,
      false,
      environment
    );
    return { connect: [s3Origin], images: [s3Origin] };
  }

  const supabaseOrigin = exactOrigin(
    'NEXT_PUBLIC_SUPABASE_URL',
    environment.NEXT_PUBLIC_SUPABASE_URL,
    true,
    environment
  );
  const realtimeOrigin = new URL(supabaseOrigin);
  realtimeOrigin.protocol =
    realtimeOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    connect: [supabaseOrigin, realtimeOrigin.origin],
    images: [supabaseOrigin],
  };
}

export function buildContentSecurityPolicy(
  backend: AdminDataBackend,
  environment: SecurityEnvironment = process.env
): string {
  const sources = activeBackendSources(backend, environment);
  const isDevelopment = environment.NODE_ENV !== 'production';
  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSources.join(' ')}`,
    `script-src-attr 'none'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${sources.images.join(' ')}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${sources.connect.join(' ')}`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

export function securityHeaders(
  backend: AdminDataBackend,
  environment: SecurityEnvironment = process.env
): Array<[string, string]> {
  const mode = cspMode(environment.ADMIN_CSP_MODE);
  const headers: Array<[string, string]> = [
    [
      mode === 'report-only'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy',
      buildContentSecurityPolicy(backend, environment),
    ],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ];
  if (environment.NODE_ENV === 'production') {
    headers.push([
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    ]);
  }
  return headers;
}

export async function proxy(request: NextRequest) {
  const backend = getAdminDataBackend();
  let response: NextResponse;

  if (backend === 'aws') {
    response = NextResponse.next({ request });
  } else {
    const { updateSession } = await import('@/lib/supabase/middleware');
    response = await updateSession(request);
  }

  for (const [name, value] of securityHeaders(backend)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico, robots.txt, sitemap.xml
     * - common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
