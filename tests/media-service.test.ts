import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  MAX_IMAGE_BYTES,
  type ImageUploadDescriptor,
} from '../lib/domain/media/contracts';
import {
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadIntegrityError,
  MediaValidationError,
} from '../lib/domain/media/errors';
import {
  normalizedExtension,
  validateUploadDescriptor,
} from '../lib/domain/media/validation';
import { PostVersionConflictError } from '../lib/domain/posts/errors';
import type { Post } from '../lib/domain/posts/types';
import { InMemoryDynamoDbPort } from '../lib/aws/dynamodb/in-memory-port';
import { DynamoDbMediaIntentRepository } from '../lib/aws/dynamodb/media-intent-repository';
import { DynamoDbPostRepository } from '../lib/aws/dynamodb/post-repository';
import type {
  MediaObjectStore,
  SignedObjectUrl,
  StoredObjectMetadata,
} from '../lib/aws/media/object-store';
import { MediaService } from '../lib/aws/media/service';
import type { PendingUploadIntent } from '../lib/aws/media/types';

const TIME = '2026-08-04T10:00:00.000Z';
const CHECKSUM = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const OLD_UPLOAD_ID = 'a'.repeat(64);

function postFixture(): Post {
  return {
    id: 'post-1',
    category: { id: 'category-1', slug: 'category-1' },
    sortOrder: 1,
    published: false,
    date: '2026-08-04',
    author: 'Fixture Author',
    createdAt: TIME,
    updatedAt: TIME,
    translations: {
      ca: {
        id: 'translation-ca',
        title: 'Títol de prova',
        content: 'Contingut de prova',
        slug: 'titol-de-prova',
        keywords: [],
        references: [],
        translationStatus: 'complete',
      },
      en: {
        id: 'translation-en',
        title: 'Fixture title',
        content: 'Fixture content',
        slug: 'fixture-title',
        keywords: [],
        references: [],
        translationStatus: 'complete',
      },
    },
    mainImage: {
      key: `images/posts/post-1/main/${OLD_UPLOAD_ID}.webp`,
      title: 'Old main',
      alt: 'Old main image',
      contentType: 'image/webp',
      sizeBytes: 100,
      createdAt: TIME,
      updatedAt: TIME,
    },
    thumbImage: {
      key: 'images/imported-thumb.webp',
      title: 'Imported thumb',
      alt: 'Imported thumbnail',
      contentType: 'image/webp',
      sizeBytes: 80,
      createdAt: TIME,
      updatedAt: TIME,
    },
    version: 9,
    migration: null,
  };
}

function descriptor(
  overrides: Partial<ImageUploadDescriptor> = {}
): ImageUploadDescriptor {
  return {
    role: 'main',
    fileName: 'replacement.webp',
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    expectedVersion: 1,
    ...overrides,
  };
}

class FakeObjectStore implements MediaObjectStore {
  readonly objects = new Map<string, StoredObjectMetadata>();
  readonly presignedUploads: PendingUploadIntent[] = [];
  readonly copied: Array<{ source: string; destination: string }> = [];
  readonly deleted: string[] = [];
  onDelete?: (key: string) => Promise<void>;

  async presignUpload(intent: PendingUploadIntent): Promise<SignedObjectUrl> {
    this.presignedUploads.push(structuredClone(intent));
    return {
      url: `https://private.invalid/upload/${intent.uploadId}`,
      expiresAt: '2026-08-04T10:05:00.000Z',
    };
  }

  async presignDownload(key: string): Promise<SignedObjectUrl> {
    return {
      url: `https://private.invalid/download/${encodeURIComponent(key)}`,
      expiresAt: '2026-08-04T10:05:00.000Z',
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    return this.objects.get(key) ?? null;
  }

  async copy(source: string, destination: string): Promise<string | null> {
    const object = this.objects.get(source);
    if (!object) throw new Error('missing source');
    this.copied.push({ source, destination });
    this.objects.set(destination, structuredClone(object));
    return object.checksumSha256;
  }

  async delete(key: string): Promise<void> {
    if (this.onDelete) await this.onDelete(key);
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

async function harness() {
  let time = TIME;
  const clock = () => new Date(time);
  const port = new InMemoryDynamoDbPort();
  const posts = new DynamoDbPostRepository(port, { clock });
  const created = await posts.create(postFixture());
  const intents = new DynamoDbMediaIntentRepository(port, posts);
  const objects = new FakeObjectStore();
  const service = new MediaService(posts, intents, objects, clock);
  return {
    created,
    intents,
    objects,
    port,
    posts,
    service,
    setTime(value: string) {
      time = value;
    },
  };
}

test('media validation enforces MIME, extension, checksum, and size', () => {
  assert.equal(normalizedExtension('image/jpeg'), 'jpg');
  assert.deepEqual(
    validateUploadDescriptor(
      descriptor({ fileName: 'photo.JPEG', contentType: 'image/jpeg' })
    ).contentType,
    'image/jpeg'
  );
  assert.throws(
    () => validateUploadDescriptor(descriptor({ fileName: 'photo.gif' })),
    MediaValidationError
  );
  assert.throws(
    () =>
      validateUploadDescriptor(descriptor({ sizeBytes: MAX_IMAGE_BYTES + 1 })),
    MediaValidationError
  );
  assert.throws(
    () => validateUploadDescriptor({ ...descriptor(), role: 'hero' }),
    MediaValidationError
  );
});

test('presign is post-version bound, opaque, and idempotent', async () => {
  const { objects, service } = await harness();
  const first = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0001'
  );
  const replay = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0001'
  );

  assert.equal(replay.uploadId, first.uploadId);
  assert.equal(first.objectKey.includes('post-1'), false);
  assert.match(first.objectKey, /^temporary\/[a-f0-9]{64}\.webp$/);
  assert.equal(objects.presignedUploads.length, 2);
  await assert.rejects(
    service.createUpload(
      'post-1',
      descriptor({ sizeBytes: 2049 }),
      'presign-request-0001'
    ),
    MediaUploadConflictError
  );
  await assert.rejects(
    service.createUpload(
      'post-1',
      descriptor({ expectedVersion: 2 }),
      'presign-request-0002'
    ),
    PostVersionConflictError
  );
});

test('valid confirm attaches the image before deleting prior owned objects', async () => {
  const { objects, posts, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0003'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  objects.onDelete = async key => {
    if (key.includes(OLD_UPLOAD_ID)) {
      assert.equal((await posts.getById('post-1'))?.version, 2);
    }
  };

  const confirmed = await service.confirmUpload({
    postId: 'post-1',
    uploadId: upload.uploadId,
    title: 'New main',
    alt: 'New main image',
    idempotencyKey: 'confirm-request-0001',
  });
  const stored = await posts.getById('post-1');

  assert.equal(confirmed.postVersion, 2);
  assert.equal(confirmed.cleanupPending, false);
  assert.equal(stored?.mainImage?.key, confirmed.image.image.key);
  assert.deepEqual(objects.deleted.toSorted(), [
    `images/posts/post-1/main/${OLD_UPLOAD_ID}.webp`,
    upload.objectKey,
  ]);
});

test('failed conditional confirm preserves the prior image and removes the unattached copy', async () => {
  const { objects, posts, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0004'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  const current = (await posts.getById('post-1'))!;
  await posts.update({ ...current, author: 'Concurrent editor' }, 1);

  await assert.rejects(
    service.confirmUpload({
      postId: 'post-1',
      uploadId: upload.uploadId,
      title: 'Stale main',
      alt: 'Stale main image',
      idempotencyKey: 'confirm-request-0002',
    }),
    PostVersionConflictError
  );
  const stored = await posts.getById('post-1');
  const permanentKey = objects.copied[0]?.destination;
  assert.equal(stored?.mainImage?.key.includes(OLD_UPLOAD_ID), true);
  assert.equal(objects.deleted.includes(upload.objectKey), false);
  assert.equal(
    permanentKey ? objects.deleted.includes(permanentKey) : false,
    true
  );
  assert.equal(
    objects.deleted.some(key => key.includes(OLD_UPLOAD_ID)),
    false
  );
});

test('HEAD mismatch fails before copy or post mutation', async () => {
  const { objects, posts, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0005'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2049,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  await assert.rejects(
    service.confirmUpload({
      postId: 'post-1',
      uploadId: upload.uploadId,
      title: '',
      alt: '',
      idempotencyKey: 'confirm-request-0003',
    }),
    MediaUploadIntegrityError
  );
  assert.equal(objects.copied.length, 0);
  assert.equal((await posts.getById('post-1'))?.version, 1);
});

test('expired upload intent fails before copy or post mutation', async () => {
  const { objects, posts, service, setTime } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-expired'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  setTime('2026-08-04T10:05:01.000Z');

  await assert.rejects(
    service.confirmUpload({
      postId: 'post-1',
      uploadId: upload.uploadId,
      title: '',
      alt: '',
      idempotencyKey: 'confirm-request-expired',
    }),
    MediaUploadExpiredError
  );
  assert.equal(objects.copied.length, 0);
  assert.equal(objects.deleted.length, 0);
  assert.equal((await posts.getById('post-1'))?.version, 1);
});

test('cleanup failure preserves the attached image and is reported', async () => {
  const { objects, posts, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-cleanup'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  objects.onDelete = async key => {
    if (key.includes(OLD_UPLOAD_ID))
      throw new Error('simulated cleanup failure');
  };

  const confirmed = await service.confirmUpload({
    postId: 'post-1',
    uploadId: upload.uploadId,
    title: 'Cleanup warning',
    alt: 'Attached despite cleanup warning',
    idempotencyKey: 'confirm-request-cleanup',
  });

  assert.equal(confirmed.cleanupPending, true);
  assert.equal(
    (await posts.getById('post-1'))?.mainImage?.key,
    confirmed.image.image.key
  );
  assert.equal(objects.objects.has(confirmed.image.image.key), true);
});

test('confirmed requests replay only with the same idempotency key', async () => {
  const { objects, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0006'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  const input = {
    postId: 'post-1',
    uploadId: upload.uploadId,
    title: 'Replay-safe',
    alt: 'Replay-safe image',
    idempotencyKey: 'confirm-request-0004',
  };
  await service.confirmUpload(input);
  const replayed = await service.confirmUpload(input);
  assert.equal(replayed.replayed, true);
  assert.equal(objects.copied.length, 1);
  await assert.rejects(
    service.confirmUpload({
      ...input,
      idempotencyKey: 'confirm-request-changed',
    }),
    MediaUploadConflictError
  );
});

test('concurrent confirmation replay never deletes the winner object', async () => {
  const { objects, posts, service } = await harness();
  const upload = await service.createUpload(
    'post-1',
    descriptor(),
    'presign-request-0007'
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  const input = {
    postId: 'post-1',
    uploadId: upload.uploadId,
    title: 'Concurrent replay',
    alt: 'Concurrent replay image',
    idempotencyKey: 'confirm-request-0007',
  };

  const results = await Promise.all([
    service.confirmUpload(input),
    service.confirmUpload(input),
  ]);
  const permanentKey = results[0].image.image.key;

  assert.equal((await posts.getById('post-1'))?.version, 2);
  assert.equal(objects.deleted.includes(permanentKey), false);
  assert.equal(objects.objects.has(permanentKey), true);
  assert.equal(
    results.some(result => result.replayed),
    true
  );
});

test('replacement never cleans up a destination that is already attached', async () => {
  const { objects, posts, service } = await harness();
  const idempotencyKey = 'presign-request-reused';
  const uploadId = createHash('sha256')
    .update(`media-upload\u0000post-1\u0000${idempotencyKey}`, 'utf8')
    .digest('hex');
  const permanentKey = `images/posts/post-1/main/${uploadId}.webp`;
  const current = (await posts.getById('post-1'))!;
  await posts.update(
    {
      ...current,
      mainImage: { ...current.mainImage!, key: permanentKey },
    },
    1
  );
  objects.objects.set(permanentKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });
  const upload = await service.createUpload(
    'post-1',
    descriptor({ expectedVersion: 2 }),
    idempotencyKey
  );
  objects.objects.set(upload.objectKey, {
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    encryption: 'AES256',
  });

  const confirmed = await service.confirmUpload({
    postId: 'post-1',
    uploadId: upload.uploadId,
    title: 'Same destination',
    alt: 'Same destination replacement',
    idempotencyKey: 'confirm-request-reused',
  });

  assert.equal(confirmed.image.image.key, permanentKey);
  assert.equal(objects.deleted.includes(permanentKey), false);
  assert.equal(objects.objects.has(permanentKey), true);
});

test('inspection signs only keys owned by the post and role', async () => {
  const { service } = await harness();
  const inspected = await service.inspect('post-1');
  assert.match(
    inspected.images.main?.previewUrl ?? '',
    /^https:\/\/private\.invalid/
  );
  assert.equal(inspected.images.thumb?.previewUrl, null);
});
