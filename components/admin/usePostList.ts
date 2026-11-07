'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AdminReadError,
  getAdminPostsPage,
  resolveUnpublishedCount,
  type AdminPostSummary,
} from '@/lib/api/adminReads';

import {
  DEFAULT_FILTERS,
  FIRST_PAGE,
  postListQuery,
  turnPage,
  type PageState,
  type PostFilters,
} from './postListQuery';

const POSTS_PER_PAGE = 10;
const SEARCH_DEBOUNCE_MS = 250;

/** The admin post list: filters, debounced title search, cursor pages, retry. */
export function usePostList() {
  const [posts, setPosts] = useState<AdminPostSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<PostFilters>(DEFAULT_FILTERS);
  const [pages, setPages] = useState<PageState>(FIRST_PAGE);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>();
  const [unpublishedCount, setUnpublishedCount] = useState<number>();
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState<AdminReadError | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);

  const cursor = pages.cursors[pages.page - 1];

  useEffect(() => {
    const nextSearch = searchQuery.trim();
    if (nextSearch === debouncedSearch) return;

    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setReadError(null);
      setPages(FIRST_PAGE);
      setNextCursor(null);
      setDebouncedSearch(nextSearch);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [debouncedSearch, searchQuery]);

  useEffect(() => {
    const controller = new AbortController();

    void getAdminPostsPage({
      ...postListQuery(filters, debouncedSearch, cursor, POSTS_PER_PAGE),
      signal: controller.signal,
    })
      .then(page => {
        setPosts(page.items);
        setNextCursor(page.nextCursor);
        setTotalCount(page.totalCount);
        setUnpublishedCount(currentCount =>
          resolveUnpublishedCount(currentCount, page.unpublishedCount)
        );
        setReadError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setPosts([]);
        setNextCursor(null);
        setReadError(
          error instanceof AdminReadError
            ? error
            : new AdminReadError(
                'No s’han pogut carregar els articles.',
                500,
                'READ_FAILED'
              )
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [cursor, debouncedSearch, filters, readAttempt]);

  const beginListChange = useCallback(() => {
    setIsLoading(true);
    setReadError(null);
  }, []);

  const refresh = useCallback(() => {
    beginListChange();
    setReadAttempt(attempt => attempt + 1);
  }, [beginListChange]);

  const setFilter = <K extends keyof PostFilters>(
    key: K,
    value: PostFilters[K]
  ) => {
    if (value === filters[key]) return;
    beginListChange();
    setPages(FIRST_PAGE);
    setNextCursor(null);
    setFilters(current => ({ ...current, [key]: value }));
  };

  const goToPage = (page: number) => {
    const next = turnPage(pages, page, nextCursor);
    if (!next) return;
    beginListChange();
    setPages(next);
  };

  return {
    posts,
    isLoading,
    readError,
    refresh,
    searchQuery,
    setSearchQuery,
    filters,
    setFilter,
    hasFilters:
      searchQuery !== '' ||
      filters.status !== 'all' ||
      filters.category !== 'all' ||
      filters.imageStatus !== 'all',
    currentPage: pages.page,
    totalPages:
      totalCount === undefined
        ? undefined
        : Math.max(1, Math.ceil(totalCount / POSTS_PER_PAGE)),
    hasNextPage: nextCursor !== null,
    goToPage,
    unpublishedCount,
    setUnpublishedCount,
  };
}

export type PostList = ReturnType<typeof usePostList>;
