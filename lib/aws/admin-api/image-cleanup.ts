import type { ImageRole } from '@/lib/domain/media/contracts';
import type { MediaObjectStore } from '@/lib/aws/media/object-store';
import { isOwnedImageKey } from '@/lib/aws/media/service';

import type { AdminLogger } from './context';

export async function cleanupImages(
  postId: string,
  imageKeys: string[],
  objects: Pick<MediaObjectStore, 'delete'>,
  logger: AdminLogger,
  logScope = 'post_delete',
  role?: ImageRole
): Promise<{ pending: boolean; failedCount: number }> {
  const ownedKeys = imageKeys.filter(key => {
    if (role) return isOwnedImageKey(postId, role, key);
    return (
      isOwnedImageKey(postId, 'main', key) ||
      isOwnedImageKey(postId, 'thumb', key)
    );
  });
  const skippedCount = imageKeys.length - ownedKeys.length;
  if (skippedCount > 0) {
    logger.warn({
      message: `${logScope}_unowned_image_cleanup_skipped`,
      postId,
      skippedCount,
    });
  }
  const cleanup = await Promise.allSettled(
    [...new Set(ownedKeys)].map(key => objects.delete(key))
  );
  const failedCount = cleanup.filter(
    result => result.status === 'rejected'
  ).length;
  if (failedCount > 0) {
    logger.warn({
      message: `${logScope}_image_cleanup_incomplete`,
      postId,
      failedCount,
    });
  }
  return { pending: failedCount > 0, failedCount };
}
