import {
  isReservedPostSlug,
  legacySlugChanges,
  withReplacedSlugs,
  type LegacySlugChange,
} from '@/lib/domain/posts/public-slugs';
import type { Post, PostLanguage } from '@/lib/domain/posts/types';

import { AdminMutationError, updateAwsPost } from './adminMutations';
import {
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

async function readAll(
  dependencies: LegacySlugDependencies,
  published?: boolean
): Promise<Post[]> {
  const ids = await dependencies.listPostIds(published);
  const posts: Post[] = [];
  // Small fixed width keeps ~100 reads quick without bursting the API.
  for (let index = 0; index < ids.length; index += 4) {
    const batch = await Promise.all(
      ids.slice(index, index + 4).map(id => dependencies.getPost(id))
    );
    for (const post of batch) if (post) posts.push(post);
  }
  return posts;
}

/** Preview of every post that still has a legacy numeric slug. */
export async function scanLegacySlugs(
  dependencies: LegacySlugDependencies,
  categorySlugs: readonly string[]
): Promise<LegacySlugRow[]> {
  const posts = await readAll(dependencies);
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
      // Stable per post version: a retried request cannot apply twice.
      `post-slug-fix:${post.id}:v${post.version}`
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
  dependencies: LegacySlugDependencies = legacySlugDependencies
): Promise<number> {
  const drafts = await readAll(dependencies, false);
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

export const legacySlugDependencies: LegacySlugDependencies = {
  async listPostIds(published) {
    const ids: string[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await getAdminPostsPage({
        limit: AWS_ADMIN_POST_PAGE_LIMIT,
        cursor,
        direction: 'ascending',
        ...(published === undefined ? {} : { published }),
      });
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
    return (await getAdminPostById(id))?.aws_post ?? null;
  },
  updatePost(post, expectedVersion, idempotencyKey) {
    return updateAwsPost(post, expectedVersion, idempotencyKey);
  },
};
