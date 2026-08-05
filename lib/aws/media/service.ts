import { createHash } from 'node:crypto';

import {
  PRESIGNED_URL_TTL_SECONDS,
  type ConfirmedImageUpload,
  type ImagePreview,
  type ImageRole,
  type ImageUploadDescriptor,
  type MediaInspection,
  type PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import {
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadIntegrityError,
  MediaUploadNotFoundError,
} from '@/lib/domain/media/errors';
import { normalizedExtension } from '@/lib/domain/media/validation';
import {
  PostNotFoundError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';
import type { Post, PostImage } from '@/lib/domain/posts/types';
import { DynamoDbMediaIntentRepository } from '@/lib/aws/dynamodb/media-intent-repository';
import { DynamoDbPostRepository } from '@/lib/aws/dynamodb/post-repository';

import type { MediaObjectStore } from './object-store';
import type { PendingUploadIntent, UploadIntent } from './types';

type MediaLogger = {
  info(event: Record<string, unknown>): void;
  warn(event: Record<string, unknown>): void;
};

const NOOP_LOGGER: MediaLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function uploadRequestDigest(
  postId: string,
  descriptor: ImageUploadDescriptor
): string {
  return digest(
    JSON.stringify({
      postId,
      ...descriptor,
    })
  );
}

function ownedImagePrefix(postId: string, role: ImageRole): string {
  return `images/posts/${postId}/${role}/`;
}

export function isOwnedImageKey(
  postId: string,
  role: ImageRole,
  key: string
): boolean {
  const prefix = ownedImagePrefix(postId, role);
  return (
    key.startsWith(prefix) &&
    /^[a-f0-9]{64}\.(?:jpg|png|webp|avif)$/.test(key.slice(prefix.length))
  );
}

function imageForRole(post: Post, role: ImageRole): PostImage | null {
  return role === 'main' ? post.mainImage : post.thumbImage;
}

export class MediaService {
  constructor(
    private readonly posts: DynamoDbPostRepository,
    private readonly intents: DynamoDbMediaIntentRepository,
    private readonly objects: MediaObjectStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly logger: MediaLogger = NOOP_LOGGER
  ) {}

  async inspect(postId: string): Promise<MediaInspection> {
    const post = await this.posts.getById(postId);
    if (!post) throw new PostNotFoundError(postId);
    const [main, thumb] = await Promise.all([
      this.preview(post, 'main'),
      this.preview(post, 'thumb'),
    ]);
    return {
      postId,
      postVersion: post.version,
      titles: {
        ca: post.translations.ca.title,
        en: post.translations.en.title,
      },
      images: { main, thumb },
    };
  }

  async createUpload(
    postId: string,
    descriptor: ImageUploadDescriptor,
    idempotencyKey: string
  ): Promise<PresignedImageUpload> {
    const post = await this.posts.getById(postId);
    if (!post) throw new PostNotFoundError(postId);
    if (post.version !== descriptor.expectedVersion) {
      throw new PostVersionConflictError(postId, descriptor.expectedVersion);
    }

    const requestDigest = uploadRequestDigest(postId, descriptor);
    const uploadId = digest(
      `media-upload\u0000${postId}\u0000${idempotencyKey}`
    );
    const extension = normalizedExtension(descriptor.contentType);
    const now = this.clock();
    const intent: PendingUploadIntent = {
      uploadId,
      requestDigest,
      postId,
      role: descriptor.role,
      temporaryKey: `temporary/${uploadId}.${extension}`,
      permanentKey: `${ownedImagePrefix(postId, descriptor.role)}${uploadId}.${extension}`,
      contentType: descriptor.contentType,
      sizeBytes: descriptor.sizeBytes,
      checksumSha256: descriptor.checksumSha256,
      expectedVersion: descriptor.expectedVersion,
      createdAt: now.toISOString(),
      expiresAt: Math.floor(now.getTime() / 1000) + PRESIGNED_URL_TTL_SECONDS,
      status: 'pending',
    };
    const stored = await this.intents.createOrGet(intent);
    if (stored.status === 'confirmed') {
      throw new MediaUploadConflictError(uploadId);
    }
    const remainingSeconds =
      stored.expiresAt - Math.floor(now.getTime() / 1000);
    if (remainingSeconds < 1) throw new MediaUploadExpiredError(uploadId);
    const signed = await this.objects.presignUpload(
      stored,
      Math.min(PRESIGNED_URL_TTL_SECONDS, remainingSeconds)
    );
    this.logger.info({
      message: 'media_upload_presigned',
      postId,
      role: descriptor.role,
      uploadId,
      objectKey: stored.temporaryKey,
    });
    return {
      uploadId,
      objectKey: stored.temporaryKey,
      uploadUrl: signed.url,
      headers: {
        'content-type': stored.contentType,
        'x-amz-checksum-sha256': stored.checksumSha256,
      },
      expiresAt: signed.expiresAt,
      postVersion: stored.expectedVersion,
    };
  }

  async confirmUpload(input: {
    postId: string;
    uploadId: string;
    title: string;
    alt: string;
    idempotencyKey: string;
  }): Promise<ConfirmedImageUpload> {
    const intent = await this.intents.require(input.uploadId);
    if (intent.postId !== input.postId) {
      throw new MediaUploadNotFoundError(input.uploadId);
    }
    const confirmDigest = digest(
      JSON.stringify({
        uploadId: input.uploadId,
        title: input.title,
        alt: input.alt,
        idempotencyKey: input.idempotencyKey,
      })
    );
    if (intent.status === 'confirmed') {
      if (intent.confirmDigest !== confirmDigest) {
        throw new MediaUploadConflictError(input.uploadId);
      }
      return this.confirmedResponse(intent, true, false);
    }

    const now = this.clock();
    if (Math.floor(now.getTime() / 1000) > intent.expiresAt) {
      throw new MediaUploadExpiredError(input.uploadId);
    }
    await this.assertUploadedObject(intent);
    const copiedChecksum = await this.objects.copy(
      intent.temporaryKey,
      intent.permanentKey
    );
    if (copiedChecksum && copiedChecksum !== intent.checksumSha256) {
      await this.bestEffortDelete(intent.permanentKey, intent.uploadId);
      throw new MediaUploadIntegrityError('copied-checksum-mismatch');
    }

    const image: PostImage = {
      key: intent.permanentKey,
      title: input.title,
      alt: input.alt,
      contentType: intent.contentType,
      sizeBytes: intent.sizeBytes,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    let replacement: { version: number; previousImageKey: string | null };
    try {
      replacement = await this.intents.confirm(intent, image, confirmDigest);
    } catch (error) {
      const resolved = await this.resolveConfirmRace(
        intent,
        confirmDigest,
        error
      );
      if (resolved) return resolved;
      await this.bestEffortDelete(intent.permanentKey, intent.uploadId);
      throw error;
    }

    const cleanupKeys = [intent.temporaryKey];
    if (
      replacement.previousImageKey &&
      replacement.previousImageKey !== intent.permanentKey &&
      isOwnedImageKey(intent.postId, intent.role, replacement.previousImageKey)
    ) {
      cleanupKeys.push(replacement.previousImageKey);
    }
    const cleanup = await Promise.allSettled(
      cleanupKeys.map(key => this.objects.delete(key))
    );
    const cleanupPending = cleanup.some(result => result.status === 'rejected');
    if (cleanupPending) {
      this.logger.warn({
        message: 'media_cleanup_incomplete',
        postId: intent.postId,
        role: intent.role,
        uploadId: intent.uploadId,
      });
    }
    const confirmed: UploadIntent = {
      ...intent,
      status: 'confirmed',
      confirmDigest,
      confirmedAt: now.toISOString(),
      resultVersion: replacement.version,
      title: input.title,
      alt: input.alt,
    };
    this.logger.info({
      message: 'media_upload_confirmed',
      postId: intent.postId,
      role: intent.role,
      uploadId: intent.uploadId,
      objectKey: intent.permanentKey,
      cleanupPending,
    });
    return this.confirmedResponse(confirmed, false, cleanupPending);
  }

  private async preview(
    post: Post,
    role: ImageRole
  ): Promise<ImagePreview | null> {
    const image = imageForRole(post, role);
    if (!image) return null;
    if (!isOwnedImageKey(post.id, role, image.key)) {
      return { image, previewUrl: null, previewExpiresAt: null };
    }
    const signed = await this.objects.presignDownload(
      image.key,
      PRESIGNED_URL_TTL_SECONDS
    );
    return {
      image,
      previewUrl: signed.url,
      previewExpiresAt: signed.expiresAt,
    };
  }

  private async assertUploadedObject(
    intent: PendingUploadIntent
  ): Promise<void> {
    const object = await this.objects.head(intent.temporaryKey);
    if (!object)
      throw new MediaUploadIntegrityError('temporary-object-missing');
    if (object.contentType !== intent.contentType) {
      throw new MediaUploadIntegrityError('content-type-mismatch');
    }
    if (object.sizeBytes !== intent.sizeBytes) {
      throw new MediaUploadIntegrityError('content-length-mismatch');
    }
    if (object.checksumSha256 !== intent.checksumSha256) {
      throw new MediaUploadIntegrityError('checksum-mismatch');
    }
    if (object.encryption !== 'AES256') {
      throw new MediaUploadIntegrityError('encryption-mismatch');
    }
  }

  private async confirmedResponse(
    intent: Extract<UploadIntent, { status: 'confirmed' }>,
    replayed: boolean,
    cleanupPending: boolean
  ): Promise<ConfirmedImageUpload> {
    const image: PostImage = {
      key: intent.permanentKey,
      title: intent.title,
      alt: intent.alt,
      contentType: intent.contentType,
      sizeBytes: intent.sizeBytes,
      createdAt: intent.confirmedAt,
      updatedAt: intent.confirmedAt,
    };
    const signed = await this.objects.presignDownload(
      image.key,
      PRESIGNED_URL_TTL_SECONDS
    );
    return {
      postId: intent.postId,
      postVersion: intent.resultVersion,
      role: intent.role,
      image: {
        image,
        previewUrl: signed.url,
        previewExpiresAt: signed.expiresAt,
      },
      cleanupPending,
      replayed,
    };
  }

  private async resolveConfirmRace(
    intent: PendingUploadIntent,
    confirmDigest: string,
    originalError: unknown
  ): Promise<ConfirmedImageUpload | null> {
    let latest: UploadIntent | null;
    try {
      latest = await this.intents.get(intent.uploadId);
    } catch {
      this.logger.warn({
        message: 'media_confirm_state_check_failed',
        postId: intent.postId,
        role: intent.role,
        uploadId: intent.uploadId,
      });
      throw originalError;
    }
    if (latest?.status === 'confirmed') {
      if (latest.confirmDigest !== confirmDigest) {
        throw new MediaUploadConflictError(intent.uploadId);
      }
      return this.confirmedResponse(latest, true, false);
    }
    if (latest?.status === 'pending') return null;

    let current: Post | null;
    try {
      current = await this.posts.getById(intent.postId);
    } catch {
      this.logger.warn({
        message: 'media_confirm_post_state_check_failed',
        postId: intent.postId,
        role: intent.role,
        uploadId: intent.uploadId,
      });
      throw originalError;
    }
    if (
      current &&
      imageForRole(current, intent.role)?.key === intent.permanentKey
    ) {
      this.logger.warn({
        message: 'media_confirm_attached_object_preserved',
        postId: intent.postId,
        role: intent.role,
        uploadId: intent.uploadId,
      });
      throw originalError;
    }
    return null;
  }

  private async bestEffortDelete(key: string, uploadId: string): Promise<void> {
    try {
      await this.objects.delete(key);
    } catch {
      this.logger.warn({
        message: 'media_unattached_object_cleanup_failed',
        uploadId,
        objectKey: key,
      });
    }
  }
}
