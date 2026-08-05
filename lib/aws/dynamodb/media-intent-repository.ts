import {
  MediaUploadConflictError,
  MediaUploadNotFoundError,
} from '@/lib/domain/media/errors';
import type { PostImage } from '@/lib/domain/posts/types';
import type {
  ConfirmedUploadIntent,
  PendingUploadIntent,
  UploadIntent,
} from '@/lib/aws/media/types';

import { DynamoDbPostRepository } from './post-repository';
import {
  DynamoTransactionCanceledError,
  type DynamoDbPort,
  type DynamoItem,
  type DynamoKey,
} from './port';

const UPLOAD_KEY_PREFIX = 'MEDIA_UPLOAD#';

function uploadKey(uploadId: string): DynamoKey {
  const value = `${UPLOAD_KEY_PREFIX}${uploadId}`;
  return { PK: value, SK: value };
}

function toItem(intent: UploadIntent): DynamoItem {
  return {
    ...uploadKey(intent.uploadId),
    entityType: 'MEDIA_UPLOAD',
    schemaVersion: 1,
    ...intent,
  };
}

function stringValue(item: DynamoItem, attribute: string): string {
  const value = item[attribute];
  if (typeof value !== 'string') {
    throw new TypeError(`Media upload intent has invalid ${attribute}`);
  }
  return value;
}

function numberValue(item: DynamoItem, attribute: string): number {
  const value = item[attribute];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`Media upload intent has invalid ${attribute}`);
  }
  return value;
}

function fromItem(item: DynamoItem): UploadIntent {
  if (item.entityType !== 'MEDIA_UPLOAD' || item.schemaVersion !== 1) {
    throw new TypeError('DynamoDB item is not a media upload intent');
  }
  const base: PendingUploadIntent = {
    uploadId: stringValue(item, 'uploadId'),
    requestDigest: stringValue(item, 'requestDigest'),
    postId: stringValue(item, 'postId'),
    role: stringValue(item, 'role') as PendingUploadIntent['role'],
    temporaryKey: stringValue(item, 'temporaryKey'),
    permanentKey: stringValue(item, 'permanentKey'),
    contentType: stringValue(
      item,
      'contentType'
    ) as PendingUploadIntent['contentType'],
    sizeBytes: numberValue(item, 'sizeBytes'),
    checksumSha256: stringValue(item, 'checksumSha256'),
    expectedVersion: numberValue(item, 'expectedVersion'),
    createdAt: stringValue(item, 'createdAt'),
    expiresAt: numberValue(item, 'expiresAt'),
    status: 'pending',
  };
  const status = stringValue(item, 'status');
  if (status === 'pending') return base;
  if (status !== 'confirmed') {
    throw new TypeError('Media upload intent has invalid status');
  }
  return {
    ...base,
    status,
    confirmDigest: stringValue(item, 'confirmDigest'),
    confirmedAt: stringValue(item, 'confirmedAt'),
    resultVersion: numberValue(item, 'resultVersion'),
    title: stringValue(item, 'title'),
    alt: stringValue(item, 'alt'),
  };
}

function sameRequest(
  existing: UploadIntent,
  requested: PendingUploadIntent
): boolean {
  return (
    existing.uploadId === requested.uploadId &&
    existing.requestDigest === requested.requestDigest &&
    existing.postId === requested.postId &&
    existing.role === requested.role &&
    existing.temporaryKey === requested.temporaryKey &&
    existing.permanentKey === requested.permanentKey &&
    existing.contentType === requested.contentType &&
    existing.sizeBytes === requested.sizeBytes &&
    existing.checksumSha256 === requested.checksumSha256 &&
    existing.expectedVersion === requested.expectedVersion
  );
}

export class DynamoDbMediaIntentRepository {
  constructor(
    private readonly dynamodb: DynamoDbPort,
    private readonly posts: DynamoDbPostRepository
  ) {}

  async createOrGet(intent: PendingUploadIntent): Promise<UploadIntent> {
    const existing = await this.get(intent.uploadId);
    if (existing) {
      if (!sameRequest(existing, intent)) {
        throw new MediaUploadConflictError(intent.uploadId);
      }
      return existing;
    }

    try {
      await this.dynamodb.transactWrite([
        {
          type: 'put',
          label: 'media-intent:create',
          item: toItem(intent),
          condition: { type: 'attributeNotExists', attribute: 'PK' },
        },
      ]);
      return intent;
    } catch (error) {
      if (!(error instanceof DynamoTransactionCanceledError)) throw error;
      const raced = await this.get(intent.uploadId);
      if (!raced || !sameRequest(raced, intent)) {
        throw new MediaUploadConflictError(intent.uploadId);
      }
      return raced;
    }
  }

  async get(uploadId: string): Promise<UploadIntent | null> {
    const item = await this.dynamodb.get(uploadKey(uploadId), true);
    return item ? fromItem(item) : null;
  }

  async confirm(
    intent: PendingUploadIntent,
    image: PostImage,
    confirmDigest: string
  ): Promise<{ version: number; previousImageKey: string | null }> {
    const confirmed: ConfirmedUploadIntent = {
      ...intent,
      status: 'confirmed',
      confirmDigest,
      confirmedAt: image.updatedAt,
      resultVersion: intent.expectedVersion + 1,
      title: image.title,
      alt: image.alt,
    };
    return this.posts.replaceImage(
      {
        postId: intent.postId,
        role: intent.role,
        image,
        confirmedIntentItem: toItem(confirmed),
      },
      intent.expectedVersion
    );
  }

  async require(uploadId: string): Promise<UploadIntent> {
    const intent = await this.get(uploadId);
    if (!intent) throw new MediaUploadNotFoundError(uploadId);
    return intent;
  }
}
