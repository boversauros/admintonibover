import { AdminMutationError } from '@/lib/api/adminMutations';
import type {
  ConfirmedImageUpload,
  DetachedImage,
  ImagePreview,
  ImageRole,
} from '@/lib/domain/media/contracts';
import type { Post, PostCategory } from '@/lib/domain/posts/types';

import { postFromForm, type PostFormValues } from './postForm';

export type SavePostApi = {
  create(post: Post): Promise<Post>;
  update(post: Post, expectedVersion: number): Promise<Post>;
  setPublication(
    postId: string,
    version: number,
    published: boolean
  ): Promise<Post>;
  uploadImage(input: {
    postId: string;
    postVersion: number;
    role: ImageRole;
    file: File;
    title: string;
    alt: string;
  }): Promise<ConfirmedImageUpload>;
  detachImage(input: {
    postId: string;
    postVersion: number;
    role: ImageRole;
  }): Promise<DetachedImage>;
};

/**
 * Reported after every request that changed the post on the server, so the
 * form always knows the latest version. If a later step fails, the next save
 * updates that version instead of creating the post again or hitting a 409.
 */
export type SaveStep =
  | { type: 'saved'; post: Post; created: boolean }
  | { type: 'uploaded'; role: ImageRole; preview: ImagePreview; post: Post }
  | { type: 'detached'; role: ImageRole; post: Post };

const IMAGE_FIELDS = {
  main: { file: 'mainImageFile', post: 'mainImage' },
  thumb: { file: 'thumbImageFile', post: 'thumbImage' },
} as const;

export type ImageFileField = (typeof IMAGE_FIELDS)[ImageRole]['file'];

export function imageFileField(role: ImageRole): ImageFileField {
  return IMAGE_FIELDS[role].file;
}

/**
 * Form fields a finished step makes obsolete. Clearing them is what stops a
 * retry after a later failure from uploading or detaching the same image again.
 */
export function formResetsAfter(step: SaveStep): {
  clearFile: ImageFileField | null;
  clearRemoval: ImageRole | null;
} {
  return {
    clearFile: step.type === 'uploaded' ? imageFileField(step.role) : null,
    clearRemoval: step.type === 'saved' ? null : step.role,
  };
}

export async function savePost(
  values: PostFormValues,
  options: {
    api: SavePostApi;
    category: PostCategory;
    current?: Post;
    now: string;
    onStep: (step: SaveStep) => void;
    postId: string;
  }
): Promise<Post> {
  const { api, current, onStep } = options;
  let post = postFromForm(values, options);

  let altNotSaved = false;
  if (current) {
    post = await api.update(post, current.version);
    altNotSaved =
      !values.mainImageFile &&
      !values.removeImage.main &&
      post.mainImage !== null &&
      post.mainImage.alt !== values.mainImageAlt;
  } else {
    post = await api.create(post);
  }
  onStep({ type: 'saved', post, created: !current });

  if (!values.published && post.published) {
    post = await api.setPublication(post.id, post.version, false);
    onStep({ type: 'saved', post, created: false });
  }

  const postTitle =
    values.translations.ca.title || values.translations.en.title || 'post';
  for (const role of ['main', 'thumb'] as const) {
    const file = values[IMAGE_FIELDS[role].file];
    if (!file) continue;
    const confirmed = await api.uploadImage({
      postId: post.id,
      postVersion: post.version,
      role,
      file,
      title: role === 'main' ? 'Post Main Image' : 'Post Thumbnail',
      alt:
        role === 'main' ? values.mainImageAlt : `Miniatura per a ${postTitle}`,
    });
    post = {
      ...post,
      [IMAGE_FIELDS[role].post]: confirmed.image.image,
      version: confirmed.postVersion,
      updatedAt: confirmed.image.image.updatedAt,
    };
    onStep({ type: 'uploaded', role, preview: confirmed.image, post });
  }

  for (const role of ['main', 'thumb'] as const) {
    if (!values.removeImage[role] || !post[IMAGE_FIELDS[role].post]) continue;
    const detached = await api.detachImage({
      postId: post.id,
      postVersion: post.version,
      role,
    });
    post = {
      ...post,
      [IMAGE_FIELDS[role].post]: null,
      version: detached.postVersion,
    };
    onStep({ type: 'detached', role, post });
  }

  if (values.published && !post.published) {
    post = await api.setPublication(post.id, post.version, true);
    onStep({ type: 'saved', post, created: false });
  }

  // An old admin Lambda silently keeps the stored alt; surface that.
  if (altNotSaved) {
    throw new AdminMutationError(
      'L’article s’ha desat, però el servidor no ha acceptat el text alternatiu. Cal desplegar la versió nova del backend.',
      502,
      'IMAGE_ALT_NOT_SAVED'
    );
  }
  return post;
}
