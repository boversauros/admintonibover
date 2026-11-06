import { parsePost as parsePostShape } from '@/lib/contract/post';
import { ShapeError } from '@/lib/contract/values';
import {
  IMAGE_INVENTORY_STATUSES,
  type ImageInventoryStatus,
} from '@/lib/domain/media/contracts';
import { PostValidationError } from '@/lib/domain/posts/errors';
import type { Post } from '@/lib/domain/posts/types';
import { assertValidPost } from '@/lib/domain/posts/validation';

import type { AdminApiEvent } from './context';
import { ApiValidationError, validation } from './errors';
import { validateId } from './http';

const MAX_LIST_LIMIT = 50;

/**
 * A create/update body: the shared wire shape, then the domain rules (IDs,
 * lengths, dates, slugs) that every stored post must satisfy.
 */
export function parsePost(value: unknown): Post {
  let post: Post;
  try {
    post = parsePostShape(value);
  } catch (error) {
    if (error instanceof ShapeError) {
      throw validation(error.path, error.code, error.message);
    }
    throw error;
  }
  try {
    assertValidPost(post);
  } catch (error) {
    if (error instanceof PostValidationError) {
      throw new ApiValidationError(error.issues);
    }
    throw error;
  }
  return post;
}

export function parseListOptions(event: AdminApiEvent) {
  const query = event.queryStringParameters ?? {};
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw validation(
      'limit',
      'INVALID_PAGE_LIMIT',
      `Limit must be an integer between 1 and ${MAX_LIST_LIMIT}`
    );
  }
  const rawDirection = query.direction;
  if (
    rawDirection !== undefined &&
    rawDirection !== 'ascending' &&
    rawDirection !== 'descending'
  ) {
    throw validation(
      'direction',
      'INVALID_DIRECTION',
      'Direction must be ascending or descending'
    );
  }
  const direction: 'ascending' | 'descending' | undefined = rawDirection;
  let published: boolean | undefined;
  if (query.published !== undefined) {
    if (query.published !== 'true' && query.published !== 'false') {
      throw validation(
        'published',
        'INVALID_BOOLEAN',
        'Published must be true or false'
      );
    }
    published = query.published === 'true';
  }
  if (query.title !== undefined && query.title.length > 200) {
    throw validation('title', 'INVALID_STRING', 'Title filter is too long');
  }
  let imageStatus: ImageInventoryStatus | undefined;
  if (query.imageStatus !== undefined) {
    if (!IMAGE_INVENTORY_STATUSES.includes(query.imageStatus as never)) {
      throw validation(
        'imageStatus',
        'INVALID_IMAGE_STATUS',
        `Image status must be one of ${IMAGE_INVENTORY_STATUSES.join(', ')}`
      );
    }
    imageStatus = query.imageStatus as ImageInventoryStatus;
  }
  return {
    limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(direction ? { direction } : {}),
    ...(query.title ? { title: query.title } : {}),
    ...(published === undefined ? {} : { published }),
    ...(query.categoryId
      ? { categoryId: validateId(query.categoryId, 'categoryId') }
      : {}),
    ...(imageStatus ? { imageStatus } : {}),
  };
}
