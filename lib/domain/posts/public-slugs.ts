import { slugify } from '@/lib/utils/slugify';

import { POST_LANGUAGES, type Post, type PostLanguage } from './types';

/**
 * Public-site rules for post slugs (admin #68).
 *
 * Post pages share `/<lang>/reflexions/<slug>/` with the site's listing
 * routes, so some slugs hide a post behind a listing page. These rules run in
 * the browser only: domain validation also runs when stored posts are read,
 * and the migrated legacy slugs must stay readable until they are replaced.
 */

/**
 * The import turned the Supabase placeholder slugs `-N` into `N`. A numeric
 * slug that its own title would not produce is such a leftover; a post
 * genuinely titled "1968" keeps `1968`.
 */
export function isLegacyNumericSlug(slug: string, title: string): boolean {
  return /^\d+$/.test(slug) && slug !== slugify(title);
}

/** Slugs that always collide with a listing route of the public site. */
export function isReservedPostSlug(
  slug: string,
  categorySlugs: readonly string[]
): boolean {
  return slug === 'index' || categorySlugs.includes(slug);
}

export type LegacySlugChange = {
  language: PostLanguage;
  from: string;
  to: string;
};

/** Replacement slugs for every legacy numeric slug of one post. */
export function legacySlugChanges(post: Post): LegacySlugChange[] {
  return POST_LANGUAGES.flatMap(language => {
    const { slug, title } = post.translations[language];
    const to = slugify(title);
    return slug && to && isLegacyNumericSlug(slug, title)
      ? [{ language, from: slug, to }]
      : [];
  });
}

/** The same post with only the given slugs and `updatedAt` changed. */
export function withReplacedSlugs(
  post: Post,
  changes: readonly LegacySlugChange[],
  now: string
): Post {
  const translations = { ...post.translations };
  for (const { language, to } of changes) {
    translations[language] = { ...translations[language], slug: to };
  }
  return { ...post, translations, updatedAt: now };
}
