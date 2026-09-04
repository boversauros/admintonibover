import {
  IMAGE_INVENTORY_STATUSES,
  type ImageInventoryStatus,
} from '@/lib/domain/media/contracts';
import type { ListPostsOptions } from '@/lib/domain/posts/repository';

function imageStatusFromQuery(
  value: string | null
): ImageInventoryStatus | undefined {
  return IMAGE_INVENTORY_STATUSES.find(status => status === value);
}

export function parseAdminPostListSearchParams(
  query: URLSearchParams
): ListPostsOptions {
  const direction = query.get('direction');
  const published = query.get('published');
  const imageStatus = imageStatusFromQuery(query.get('imageStatus'));

  return {
    limit: Number(query.get('limit') ?? '10'),
    ...(query.get('cursor')
      ? { cursor: query.get('cursor') ?? undefined }
      : {}),
    ...(direction === 'ascending' || direction === 'descending'
      ? { direction }
      : {}),
    ...(query.get('title') ? { title: query.get('title') ?? undefined } : {}),
    ...(published === 'true' || published === 'false'
      ? { published: published === 'true' }
      : {}),
    ...(query.get('categoryId')
      ? { categoryId: query.get('categoryId') ?? undefined }
      : {}),
    ...(imageStatus ? { imageStatus } : {}),
  };
}
