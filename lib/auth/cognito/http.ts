import type { CognitoConfig } from './config';

export function safeReturnTo(
  candidate: string | null,
  config: CognitoConfig
): string {
  if (!candidate) return '/';

  try {
    const applicationOrigin = config.appOrigin;
    const resolved = new URL(candidate, `${applicationOrigin}/`);
    if (
      resolved.origin !== applicationOrigin ||
      !resolved.pathname.startsWith('/') ||
      resolved.pathname.startsWith('/auth/')
    ) {
      return '/';
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}

export function isSameOriginMutation(
  request: Request,
  config: CognitoConfig
): boolean {
  const origin = request.headers.get('origin');
  if (origin !== config.appOrigin) return false;

  const fetchSite = request.headers.get('sec-fetch-site');
  return fetchSite === null || fetchSite === 'same-origin';
}

export function isJsonRequest(request: Request): boolean {
  return (
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase() === 'application/json'
  );
}
