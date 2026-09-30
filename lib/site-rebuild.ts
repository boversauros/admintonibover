/**
 * Server-only trigger for the public-site Vercel Deploy Hook (admin #58).
 *
 * The hook URL is a bearer secret: anyone holding it can start site builds.
 * It is read only from server configuration, never logged, and never copied
 * into responses. Hook failures never change a committed mutation's result.
 */

export const SITE_REBUILD_HOOK_ENV = 'SITE_REBUILD_HOOK_URL';
export const SITE_REBUILD_HEADER = 'x-site-rebuild';
export const SITE_REBUILD_TIMEOUT_MS = 5_000;

/**
 * - `requested`: Vercel accepted the hook; a build is queued, not finished.
 * - `failed`: the hook was rejected, rate limited, timed out or misconfigured.
 * - `disabled`: no hook is configured in this environment.
 * - `skipped`: the mutation cannot change the published site.
 */
export type SiteRebuildStatus = 'requested' | 'failed' | 'disabled' | 'skipped';

/**
 * - `always`: publication changes, deletes and image attach/detach.
 * - `ifPublished`: post create/update, only when the stored post is published.
 * - `ifPublishedCount`: bulk publication, only when it published something.
 */
export type SiteRebuildPolicy = 'always' | 'ifPublished' | 'ifPublishedCount';

type HookEnvironment = Record<string, string | undefined>;

const HOOK_HOST = 'api.vercel.com';
const HOOK_PATH = /^\/v1\/integrations\/deploy\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/;

/** Returns the validated hook URL, `null` when unset, or throws when malformed. */
export function siteRebuildHookUrl(
  environment: HookEnvironment = process.env
): URL | null {
  const value = environment[SITE_REBUILD_HOOK_ENV]?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${SITE_REBUILD_HOOK_ENV} is not a valid URL`);
  }
  const queryNames = [...url.searchParams.keys()];
  if (
    url.protocol !== 'https:' ||
    url.hostname !== HOOK_HOST ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    !HOOK_PATH.test(url.pathname) ||
    queryNames.some(name => name !== 'buildCache')
  ) {
    throw new Error(
      `${SITE_REBUILD_HOOK_ENV} must be a Vercel Deploy Hook URL`
    );
  }
  return url;
}

function logRebuildEvent(
  event: 'site_rebuild_failed' | 'site_rebuild_misconfigured',
  details: Record<string, string | number>
): void {
  // Fixed fields only: fetch errors and messages can embed the secret URL.
  console.error(JSON.stringify({ event, ...details }));
}

export async function triggerSiteRebuild(
  reason: string,
  {
    environment = process.env,
    fetchImpl = fetch,
    timeoutMs = SITE_REBUILD_TIMEOUT_MS,
  }: {
    environment?: HookEnvironment;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<SiteRebuildStatus> {
  let url: URL | null;
  try {
    url = siteRebuildHookUrl(environment);
  } catch {
    logRebuildEvent('site_rebuild_misconfigured', { reason });
    return 'failed';
  }
  if (!url) return 'disabled';

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return 'requested';
    logRebuildEvent('site_rebuild_failed', {
      reason,
      failure: response.status === 429 ? 'rate_limited' : 'rejected',
      status: response.status,
    });
    return 'failed';
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    logRebuildEvent('site_rebuild_failed', {
      reason,
      failure: timedOut ? 'timeout' : 'network',
    });
    return 'failed';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decides from a successful upstream body whether the site can have changed. */
export function mutationAffectsSite(
  policy: SiteRebuildPolicy,
  responseBody: string
): boolean {
  if (policy === 'always') return true;
  let data: unknown;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    data = isRecord(parsed) ? parsed.data : undefined;
  } catch {
    // An unreadable success body cannot prove the site is unaffected.
    return true;
  }
  if (!isRecord(data)) return true;
  if (policy === 'ifPublishedCount') {
    return typeof data.publishedCount === 'number'
      ? data.publishedCount > 0
      : true;
  }
  const post = data.post;
  return isRecord(post) && typeof post.published === 'boolean'
    ? post.published
    : true;
}

/**
 * Hook outcome for one proxied mutation, or `null` when no header applies.
 * Only committed (2xx) upstream mutations with a policy may trigger a build.
 */
export async function siteRebuildForMutation(
  policy: SiteRebuildPolicy | undefined,
  upstream: { ok: boolean; body: string },
  reason: string,
  trigger: (reason: string) => Promise<SiteRebuildStatus> = triggerSiteRebuild
): Promise<SiteRebuildStatus | null> {
  if (!policy || !upstream.ok) return null;
  if (!mutationAffectsSite(policy, upstream.body)) return 'skipped';
  try {
    return await trigger(reason);
  } catch {
    return 'failed';
  }
}
