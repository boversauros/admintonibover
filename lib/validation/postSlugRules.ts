import type { FieldErrors, Resolver } from 'react-hook-form';

import { isReservedPostSlug } from '@/lib/domain/posts/public-slugs';
import type { Language, PostFormData } from '@/lib/types/post';

import { postFormResolver, type PostFormValidationContext } from './postSchema';

// Kept apart from postSchema.ts, which the admin Lambda bundles for its limits.

export type PostFormSlugContext = PostFormValidationContext & {
  /** Category slugs are also listing addresses on the public site. */
  categorySlugs?: readonly string[];
};

const LANGUAGE_LABELS: Record<Language, string> = {
  ca: 'català',
  en: 'anglès',
};

/** Title errors for slugs that a public-site listing page would hide. */
export function validatePostSlugs(
  values: PostFormData,
  categorySlugs: readonly string[]
): FieldErrors<PostFormData> {
  const translations: Partial<
    Record<Language, { title: { type: string; message: string } }>
  > = {};
  for (const language of ['ca', 'en'] as const) {
    const { slug } = values.translations[language];
    if (isReservedPostSlug(slug, categorySlugs)) {
      translations[language] = {
        title: {
          type: 'reservedSlug',
          message: `L’adreça web d’aquest títol en ${LANGUAGE_LABELS[language]} («${slug}») ja la fa servir una pàgina del web. Canvia el títol.`,
        },
      };
    }
  }
  return Object.keys(translations).length > 0 ? { translations } : {};
}

export const postFormWithSlugsResolver: Resolver<
  PostFormData,
  PostFormSlugContext
> = async (values, context, options) => {
  const result = await postFormResolver(values, context, options);
  const slugErrors = validatePostSlugs(values, context?.categorySlugs ?? []);
  if (!slugErrors.translations) return result;
  const errors = result.errors as FieldErrors<PostFormData>;
  return {
    values: {},
    errors: {
      ...errors,
      translations: {
        ca: { ...errors.translations?.ca, ...slugErrors.translations.ca },
        en: { ...errors.translations?.en, ...slugErrors.translations.en },
      },
    },
  };
};
