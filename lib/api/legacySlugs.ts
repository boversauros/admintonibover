import {
  isReservedPostSlug,
  legacySlugChanges,
  withReplacedSlugs,
  type LegacySlugChange,
} from '@/lib/domain/posts/public-slugs';
import type { Post, PostLanguage } from '@/lib/domain/posts/types';

import {
  AdminMutationError,
  mutationKey,
  updateAwsPost,
} from './adminMutations';
import {
  AdminReadError,
  AWS_ADMIN_POST_PAGE_LIMIT,
  getAdminPostById,
  getAdminPostsPage,
} from './adminReads';

/**
 * One-time replacement of the legacy numeric slugs left by the import
 * (admin #68). Every post is saved through the normal update route, one at a
 * time, after a fresh read, changing nothing but its slugs and `updatedAt`.
 */

export type LegacySlugDependencies = {
  listPostIds(published?: boolean): Promise<string[]>;
  getPost(id: string): Promise<Post | null>;
  updatePost(
    post: Post,
    expectedVersion: number,
    idempotencyKey: string
  ): Promise<Post>;
};

export type LegacySlugRow = {
  postId: string;
  sortOrder: number;
  title: string;
  published: boolean;
  changes: LegacySlugChange[];
  /** Why this post cannot be changed automatically; `null` when it can. */
  blocked: string | null;
};

export type LegacySlugOutcome =
  | { status: 'updated'; post: Post }
  | { status: 'unchanged' }
  | { status: 'failed'; message: string };

const LANGUAGE_LABELS: Record<PostLanguage, string> = {
  ca: 'català',
  en: 'anglès',
};

export type LegacySlugProgress = (done: number, total: number) => void;

async function readAll(
  dependencies: LegacySlugDependencies,
  published?: boolean,
  onProgress?: LegacySlugProgress
): Promise<Post[]> {
  const ids = await dependencies.listPostIds(published);
  const posts: Post[] = [];
  onProgress?.(0, ids.length);
  // One at a time: the API allows ~2 requests per second (see pacedRequests).
  for (const [index, id] of ids.entries()) {
    const post = await dependencies.getPost(id);
    if (post) posts.push(post);
    onProgress?.(index + 1, ids.length);
  }
  return posts;
}

/** Preview of every post that still has a legacy numeric slug. */
export async function scanLegacySlugs(
  dependencies: LegacySlugDependencies,
  categorySlugs: readonly string[],
  onProgress?: LegacySlugProgress
): Promise<LegacySlugRow[]> {
  const posts = await readAll(dependencies, undefined, onProgress);
  const owners = new Map<string, string>();
  for (const post of posts) {
    for (const language of ['ca', 'en'] as const) {
      const { slug } = post.translations[language];
      if (slug) owners.set(`${language}/${slug}`, post.id);
    }
  }

  const rows: LegacySlugRow[] = [];
  const proposed = new Set<string>();
  for (const post of posts) {
    const changes = legacySlugChanges(post);
    if (changes.length === 0) continue;
    let blocked: string | null = null;
    for (const { language, to } of changes) {
      const key = `${language}/${to}`;
      const owner = owners.get(key);
      if (isReservedPostSlug(to, categorySlugs)) {
        blocked = `L’adreça en ${LANGUAGE_LABELS[language]} coincidiria amb una pàgina del web.`;
      } else if ((owner && owner !== post.id) || proposed.has(key)) {
        blocked = `Un altre article ja fa servir aquesta adreça en ${LANGUAGE_LABELS[language]}.`;
      }
      proposed.add(key);
    }
    rows.push({
      postId: post.id,
      sortOrder: post.sortOrder,
      title: post.translations.ca.title || post.translations.en.title,
      published: post.published,
      changes,
      blocked,
    });
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

function sameChanges(
  a: readonly LegacySlugChange[],
  b: readonly LegacySlugChange[]
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Applies one previewed row, re-reading the post first. */
export async function applyLegacySlugRow(
  dependencies: LegacySlugDependencies,
  row: LegacySlugRow,
  now = new Date().toISOString()
): Promise<LegacySlugOutcome> {
  try {
    const post = await dependencies.getPost(row.postId);
    if (!post)
      return { status: 'failed', message: 'L’article ja no existeix.' };
    const changes = legacySlugChanges(post);
    if (changes.length === 0) return { status: 'unchanged' };
    if (!sameChanges(changes, row.changes)) {
      return {
        status: 'failed',
        message: 'L’article ha canviat des de l’anàlisi. Torna a analitzar.',
      };
    }
    const updated = await dependencies.updatePost(
      withReplacedSlugs(post, changes, now),
      post.version,
      // A fresh key per attempt: the expected version already stops a
      // second application, and the stored digest covers `updatedAt`.
      mutationKey('post-slug-fix')
    );
    return { status: 'updated', post: updated };
  } catch (error) {
    if (
      error instanceof AdminMutationError &&
      error.code === 'POST_SLUG_CONFLICT'
    ) {
      return {
        status: 'failed',
        message: 'Un altre article ja fa servir la nova adreça.',
      };
    }
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'No s’ha pogut desar.',
    };
  }
}

/** Unpublished posts that bulk publication must not publish yet. */
export async function countDraftsWithLegacySlugs(
  dependencies: LegacySlugDependencies = legacySlugDependencies,
  onProgress?: LegacySlugProgress
): Promise<number> {
  const drafts = await readAll(dependencies, false, onProgress);
  return drafts.filter(post => legacySlugChanges(post).length > 0).length;
}

/** Old public addresses, for the redirects at the site cutover. */
export function legacyRedirects(rows: readonly LegacySlugRow[]): string[] {
  return rows.flatMap(row =>
    row.changes.map(
      ({ language, from, to }) =>
        `/${language}/reflexions/-${from}/ -> /${language}/reflexions/${to}/`
    )
  );
}

/** Gap between request starts; the API stage allows 2 per second. */
const REQUEST_INTERVAL_MS = 600;
const THROTTLE_RETRIES = 4;

const wait = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

function throttleDelay(error: unknown, attempt: number): number | null {
  if (
    !(error instanceof AdminReadError || error instanceof AdminMutationError) ||
    error.status !== 429 ||
    attempt >= THROTTLE_RETRIES
  ) {
    return null;
  }
  const seconds = Number(error.retryAfter);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : 2000 * 2 ** attempt;
}

/**
 * Spaces requests to stay under the API rate limit and retries a throttled
 * one. A throttled request did not commit, and a resent save keeps its
 * idempotency key.
 */
export function pacedRequests(
  sleep: (ms: number) => Promise<void> = wait,
  now: () => number = Date.now
) {
  let nextStart = 0;
  return async function paced<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const start = Math.max(nextStart, now());
      nextStart = start + REQUEST_INTERVAL_MS;
      if (start > now()) await sleep(start - now());
      try {
        return await request();
      } catch (error) {
        const delay = throttleDelay(error, attempt);
        if (delay === null) throw error;
        nextStart = Math.max(nextStart, now() + delay);
      }
    }
  };
}

const paced = pacedRequests();

export const legacySlugDependencies: LegacySlugDependencies = {
  async listPostIds(published) {
    const ids: string[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await paced(() =>
        getAdminPostsPage({
          limit: AWS_ADMIN_POST_PAGE_LIMIT,
          cursor,
          direction: 'ascending',
          ...(published === undefined ? {} : { published }),
        })
      );
      ids.push(...page.items.map(item => item.id));
      cursor = page.nextCursor ?? undefined;
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new AdminMutationError(
            'La paginació dels articles no és consistent.',
            502,
            'CURSOR_LOOP'
          );
        }
        seenCursors.add(cursor);
      }
    } while (cursor);
    return ids;
  },
  async getPost(id) {
    return (await paced(() => getAdminPostById(id)))?.aws_post ?? null;
  },
  updatePost(post, expectedVersion, idempotencyKey) {
    return paced(() => updateAwsPost(post, expectedVersion, idempotencyKey));
  },
};
