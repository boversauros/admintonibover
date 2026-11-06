'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import {
  countAdminPosts,
  getAwsMediaInspection,
} from '@/lib/api/adminMutations';
import { getAdminCategories, type AdminCategory } from '@/lib/api/adminReads';
import { isLegacyNumericSlug } from '@/lib/domain/posts/public-slugs';
import type { Post, PostLanguage } from '@/lib/domain/posts/types';
import type { PostFormValues } from '@/lib/forms/postForm';
import { initialPostRecord, postRecordReducer } from '@/lib/forms/postRecord';
import { slugify } from '@/lib/utils/slugify';

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useAdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAdminCategories(controller.signal)
      .then(loaded => {
        setCategories(loaded);
        if (loaded.length === 0) {
          setError(
            'No hi ha categories disponibles. Cal crear-ne una abans de desar un article.'
          );
        }
      })
      .catch(loadError => {
        if (isAbort(loadError)) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No s’han pogut carregar les categories.'
        );
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt(value => value + 1);
  }, []);
  return { categories, error, retry };
}

/**
 * The post as the server last confirmed it, plus private image previews,
 * refreshed from the media inspection whenever the post ID is known.
 */
export function usePostRecord(
  initialPost: Post | undefined,
  onError: (message: string) => void
) {
  const [record, dispatch] = useReducer(
    postRecordReducer,
    initialPost,
    initialPostRecord
  );
  const postId = record.post?.id;

  const refreshMedia = useCallback(
    async (signal?: AbortSignal) => {
      if (!postId) return;
      try {
        const inspection = await getAwsMediaInspection(postId, signal);
        dispatch({ type: 'inspected', inspection });
      } catch (error) {
        if (isAbort(error)) return;
        onError(
          error instanceof Error
            ? error.message
            : 'No s’han pogut carregar les imatges privades.'
        );
      }
    },
    [onError, postId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshMedia(controller.signal);
    return () => controller.abort();
  }, [refreshMedia]);

  return { record, dispatch, refreshMedia };
}

/** On create, the order defaults to after every existing post. */
export function useDefaultSortOrder(
  enabled: boolean,
  setValue: UseFormSetValue<PostFormValues>,
  onError: (message: string) => void
) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    countAdminPosts(controller.signal)
      .then(count => setValue('sortOrder', count + 1))
      .catch(error => {
        if (isAbort(error)) return;
        onError('No s’ha pogut calcular l’ordre inicial.');
      });
    return () => controller.abort();
  }, [enabled, onError, setValue]);
}

/**
 * Keeps the slug generated from the title until the editor changes it by hand.
 * An imported numeric slug (the old `-N` placeholder) is replaced too, so
 * saving the post fixes its address. Returns the current title.
 */
export function useAutoSlug(
  control: Control<PostFormValues>,
  setValue: UseFormSetValue<PostFormValues>,
  language: PostLanguage,
  initialTitle = ''
): string {
  const [title, slug] = useWatch({
    control,
    name: [`translations.${language}.title`, `translations.${language}.slug`],
  });
  const previousAutoSlug = useRef(initialTitle ? slugify(initialTitle) : '');

  useEffect(() => {
    if (!title) return;
    const generated = slugify(title);
    if (
      !slug ||
      slug === previousAutoSlug.current ||
      isLegacyNumericSlug(slug, title)
    ) {
      setValue(`translations.${language}.slug`, generated);
    }
    previousAutoSlug.current = generated;
  }, [language, setValue, slug, title]);

  return title;
}
