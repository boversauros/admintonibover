import type { ImageRole } from '@/lib/domain/media/contracts';
import type {
  Post,
  PostCategory,
  PostKeyword,
  PostLanguage,
  PostReference,
  PostTranslation,
} from '@/lib/domain/posts/types';
import { normalizeTitle } from '@/lib/utils/normalizeTitle';

// The admin post form edits the canonical `Post` directly. Keyword and
// reference IDs travel with the form state, so saving never has to recover
// them by matching values.

/** An empty blockquote input is `''`; it is omitted again on save. */
export type PostFormReference = Omit<PostReference, 'blockquote'> & {
  blockquote: string;
};

export type PostFormTranslation = Pick<
  PostTranslation,
  'title' | 'content' | 'slug'
> & {
  keywords: PostKeyword[];
  references: PostFormReference[];
};

export type PostFormValues = {
  categoryId: string;
  sortOrder: number;
  published: boolean;
  mainImageAlt: string;
  mainImageFile: File | null;
  thumbImageFile: File | null;
  /** A saved image the editor removed; it is detached on the next save. */
  removeImage: Record<ImageRole, boolean>;
  translations: Record<PostLanguage, PostFormTranslation>;
};

/** An opaque ID accepted by the post domain validator (max 64 chars). */
export function newPostFormId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formTranslation(translation?: PostTranslation): PostFormTranslation {
  return {
    title: translation?.title ?? '',
    content: translation?.content ?? '',
    slug: translation?.slug ?? '',
    keywords: translation?.keywords.map(keyword => ({ ...keyword })) ?? [],
    references:
      translation?.references.map(reference => ({
        ...reference,
        blockquote: reference.blockquote ?? '',
      })) ?? [],
  };
}

export function postFormValues(post?: Post): PostFormValues {
  return {
    categoryId: post?.category.id ?? '',
    sortOrder: post?.sortOrder ?? 0,
    published: post?.published ?? false,
    mainImageAlt: post?.mainImage?.alt ?? '',
    mainImageFile: null,
    thumbImageFile: null,
    removeImage: { main: false, thumb: false },
    translations: {
      ca: formTranslation(post?.translations.ca),
      en: formTranslation(post?.translations.en),
    },
  };
}

function markdownParagraphs(content: string): string {
  return content.trim().replace(/\n+/g, '\n\n');
}

function postTranslation(
  language: PostLanguage,
  values: PostFormTranslation,
  current?: PostTranslation
): PostTranslation {
  return {
    id: current?.id ?? newPostFormId(`translation-${language}`),
    title: normalizeTitle(values.title),
    content: markdownParagraphs(values.content),
    slug: values.slug,
    keywords: values.keywords.map(keyword => ({ ...keyword })),
    references: values.references.map(
      ({ blockquote, sortOrder, ...reference }, index): PostReference => ({
        ...reference,
        ...(blockquote ? { blockquote } : {}),
        sortOrder: Number.isSafeInteger(sortOrder) ? sortOrder : index,
      })
    ),
    translationStatus: 'complete',
  };
}

/**
 * Builds the post body for create/update. Publication is changed by its own
 * request after saving, so the body keeps the stored state (draft on create).
 */
export function postFromForm(
  values: PostFormValues,
  options: {
    category: PostCategory;
    current?: Post;
    now: string;
    postId: string;
  }
): Post {
  const { current, now } = options;
  return {
    id: current?.id ?? options.postId,
    category: { id: options.category.id, slug: options.category.slug },
    sortOrder: Number.isSafeInteger(values.sortOrder) ? values.sortOrder : 0,
    published: current?.published ?? false,
    date: current?.date ?? now.split('T')[0],
    author: current?.author ?? 'Admin',
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    translations: {
      ca: postTranslation(
        'ca',
        values.translations.ca,
        current?.translations.ca
      ),
      en: postTranslation(
        'en',
        values.translations.en,
        current?.translations.en
      ),
    },
    // The alt text is saved with the post, independently of the image file.
    mainImage: current?.mainImage
      ? { ...current.mainImage, alt: values.mainImageAlt }
      : null,
    thumbImage: current?.thumbImage ?? null,
    version: current?.version ?? 1,
    migration: current?.migration ?? null,
  };
}
