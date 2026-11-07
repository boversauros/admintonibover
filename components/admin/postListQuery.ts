import type {
  FilterCategory,
  FilterImageStatus,
  FilterStatus,
  SortDirection,
} from '@/components/posts';
import type { AdminPostListOptions } from '@/lib/api/adminReads';

export type PostFilters = {
  status: FilterStatus;
  category: FilterCategory;
  imageStatus: FilterImageStatus;
  sort: SortDirection;
};

export const DEFAULT_FILTERS: PostFilters = {
  status: 'all',
  category: 'all',
  imageStatus: 'all',
  sort: 'desc',
};

/** The current page plus the cursor that opened each page seen so far. */
export type PageState = {
  page: number;
  cursors: Array<string | undefined>;
};

export const FIRST_PAGE: PageState = { page: 1, cursors: [undefined] };

/** The list request for a set of filters, a search and a page cursor. */
export function postListQuery(
  filters: PostFilters,
  search: string,
  cursor: string | undefined,
  limit: number
): Omit<AdminPostListOptions, 'signal'> {
  return {
    limit,
    cursor,
    direction: filters.sort === 'desc' ? 'descending' : 'ascending',
    ...(search ? { title: search } : {}),
    ...(filters.status === 'published'
      ? { published: true }
      : filters.status === 'draft'
        ? { published: false }
        : {}),
    ...(filters.category === 'all' ? {} : { categoryId: filters.category }),
    ...(filters.imageStatus === 'all'
      ? {}
      : { imageStatus: filters.imageStatus }),
  };
}

/**
 * Cursor pagination only moves one page at a time: back to a page already
 * seen, or forward when the last read returned a next cursor. Any other move
 * returns null.
 */
export function turnPage(
  state: PageState,
  page: number,
  nextCursor: string | null
): PageState | null {
  if (page === state.page - 1 && state.page > 1) {
    return { ...state, page };
  }
  if (page === state.page + 1 && nextCursor) {
    const cursors = state.cursors.slice(0, state.page);
    cursors[state.page] = nextCursor;
    return { page, cursors };
  }
  return null;
}
