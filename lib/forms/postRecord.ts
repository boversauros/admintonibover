import type {
  ImagePreview,
  ImageRole,
  MediaInspection,
} from '@/lib/domain/media/contracts';
import type { Post } from '@/lib/domain/posts/types';

import type { SaveStep } from './savePost';

/**
 * What the server last confirmed for the post being edited: the post itself
 * (its version drives the next save) and the private image previews.
 */
export type PostRecord = {
  post: Post | null;
  previews: Record<ImageRole, ImagePreview | null>;
};

export type PostRecordAction =
  | SaveStep
  | { type: 'inspected'; inspection: MediaInspection };

function preview(image: Post['mainImage']): ImagePreview | null {
  return image ? { image, previewUrl: null, previewExpiresAt: null } : null;
}

export function initialPostRecord(post?: Post): PostRecord {
  return {
    post: post ?? null,
    previews: {
      main: preview(post?.mainImage ?? null),
      thumb: preview(post?.thumbImage ?? null),
    },
  };
}

/** Keeps an existing preview's image (e.g. a new alt text) in step with the post. */
function withSavedImage(
  current: ImagePreview | null,
  image: Post['mainImage']
): ImagePreview | null {
  return current && image ? { ...current, image } : current;
}

export function postRecordReducer(
  record: PostRecord,
  action: PostRecordAction
): PostRecord {
  switch (action.type) {
    case 'saved':
      return {
        post: action.post,
        previews: {
          main: withSavedImage(record.previews.main, action.post.mainImage),
          thumb: withSavedImage(record.previews.thumb, action.post.thumbImage),
        },
      };
    case 'uploaded':
      return {
        post: action.post,
        previews: { ...record.previews, [action.role]: action.preview },
      };
    case 'detached':
      return {
        post: action.post,
        previews: { ...record.previews, [action.role]: null },
      };
    case 'inspected': {
      const { images, postVersion } = action.inspection;
      // An inspection started before a save can answer after it; keep the
      // newer version so the next save does not fail with a conflict.
      if (record.post && postVersion < record.post.version) return record;
      return {
        post: record.post && {
          ...record.post,
          mainImage: images.main?.image ?? null,
          thumbImage: images.thumb?.image ?? null,
          version: postVersion,
        },
        previews: images,
      };
    }
  }
}
