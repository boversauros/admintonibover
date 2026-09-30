import type { SiteRebuildStatus } from '@/lib/site-rebuild';

export const SITE_REBUILD_EVENT = 'admin:site-rebuild';

const STATUSES = new Set<SiteRebuildStatus>([
  'requested',
  'failed',
  'disabled',
  'skipped',
]);

function isSiteRebuildStatus(value: string | null): value is SiteRebuildStatus {
  return value !== null && STATUSES.has(value as SiteRebuildStatus);
}

/** Broadcasts the `x-site-rebuild` outcome of a committed mutation. */
export function reportSiteRebuild(response: Response): void {
  const status = response.headers.get('x-site-rebuild');
  if (!isSiteRebuildStatus(status) || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SiteRebuildStatus>(SITE_REBUILD_EVENT, { detail: status })
  );
}

/** Asks the server to trigger the site rebuild again after a failure. */
export async function retrySiteRebuild(
  fetchImplementation: typeof fetch = fetch
): Promise<SiteRebuildStatus> {
  try {
    const response = await fetchImplementation('/api/site/rebuild', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    const status = response.headers.get('x-site-rebuild');
    return isSiteRebuildStatus(status) ? status : 'failed';
  } catch {
    return 'failed';
  }
}
