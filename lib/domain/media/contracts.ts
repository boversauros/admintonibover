import type { PostImage } from '@/lib/domain/posts/types';

export const IMAGE_ROLES = ['main', 'thumb'] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRESIGNED_URL_TTL_SECONDS = 300;

export type ImageUploadDescriptor = {
  role: ImageRole;
  fileName: string;
  contentType: AllowedImageMimeType;
  sizeBytes: number;
  checksumSha256: string;
  expectedVersion: number;
};

export type ImagePreview = {
  image: PostImage;
  previewUrl: string | null;
  previewExpiresAt: string | null;
};

export type MediaInspection = {
  postId: string;
  postVersion: number;
  titles: { ca: string; en: string };
  images: Record<ImageRole, ImagePreview | null>;
};

export type PresignedImageUpload = {
  uploadId: string;
  objectKey: string;
  uploadUrl: string;
  headers: {
    'content-type': AllowedImageMimeType;
    'x-amz-checksum-sha256': string;
  };
  expiresAt: string;
  postVersion: number;
};

export type ConfirmedImageUpload = {
  postId: string;
  postVersion: number;
  role: ImageRole;
  image: ImagePreview;
  cleanupPending: boolean;
  replayed: boolean;
};

export type MediaApiError = {
  version: 1;
  error: { code: string; message: string };
  requestId: string;
};

export type MediaApiSuccess<T> = {
  version: 1;
  data: T;
  requestId: string;
};
