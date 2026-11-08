/**
 * Public-site rules for post slugs (admin #68).
 *
 * Post pages share `/<lang>/reflexions/<slug>/` with the site's listing
 * routes, so some slugs hide a post behind a listing page. These rules run in
 * the browser only, when the form is validated.
 */

/** Slugs that always collide with a listing route of the public site. */
export function isReservedPostSlug(
  slug: string,
  categorySlugs: readonly string[]
): boolean {
  return slug === 'index' || categorySlugs.includes(slug);
}
