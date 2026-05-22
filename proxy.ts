import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseHost = (() => {
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return '';
  }
})();
const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : '';

function buildCsp(): string {
  const supabaseSrc = supabaseOrigin || '';
  const wsSupabase = supabaseHost ? `wss://${supabaseHost}` : '';
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;

  const directives = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://picsum.photos ${supabaseSrc}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${supabaseSrc} ${wsSupabase}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ];
  return directives.join('; ');
}

const SECURITY_HEADERS: Array<[string, string]> = [
  ['Content-Security-Policy', buildCsp()],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
];

if (process.env.NODE_ENV === 'production') {
  SECURITY_HEADERS.push([
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  ]);
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  for (const [name, value] of SECURITY_HEADERS) {
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
