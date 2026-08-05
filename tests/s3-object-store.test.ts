import assert from 'node:assert/strict';
import test from 'node:test';

import { S3Client } from '@aws-sdk/client-s3';

import { AwsS3MediaObjectStore } from '@/lib/aws/media/aws-s3-object-store';
import type { PendingUploadIntent } from '@/lib/aws/media/types';

const CHECKSUM = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function pendingIntent(): PendingUploadIntent {
  return {
    uploadId: 'a'.repeat(64),
    requestDigest: 'b'.repeat(64),
    postId: 'post-1',
    role: 'main',
    temporaryKey: `temporary/${'a'.repeat(64)}.webp`,
    permanentKey: `images/posts/post-1/main/${'a'.repeat(64)}.webp`,
    contentType: 'image/webp',
    sizeBytes: 2048,
    checksumSha256: CHECKSUM,
    expectedVersion: 1,
    createdAt: '2026-08-04T00:00:00.000Z',
    expiresAt: 1_786_147_500,
    status: 'pending',
  };
}

test('S3 upload URL signs the exact content type and checksum headers', async () => {
  const client = new S3Client({
    region: 'eu-west-1',
    credentials: {
      accessKeyId: 'TESTACCESSKEY',
      secretAccessKey: 'test-credential-not-used-outside-signing',
    },
  });
  const store = new AwsS3MediaObjectStore(
    'private-fixture-bucket',
    client,
    () => new Date('2026-08-04T00:00:00.000Z')
  );

  const signed = await store.presignUpload(pendingIntent(), 300);
  const url = new URL(signed.url);
  const signedHeaders =
    url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];

  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(
    url.searchParams.has('x-amz-checksum-sha256'),
    false,
    'the checksum must remain a required signed header, not a query value'
  );
  assert.deepEqual(signedHeaders.toSorted(), [
    'content-type',
    'host',
    'x-amz-checksum-sha256',
  ]);
  client.destroy();
});
