import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  MediaObjectStore,
  SignedObjectUrl,
  StoredObjectMetadata,
} from './object-store';
import type { PendingUploadIntent } from './types';

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  const metadata = record.$metadata as Record<string, unknown> | undefined;
  return (
    record.name === 'NotFound' ||
    record.name === 'NoSuchKey' ||
    metadata?.httpStatusCode === 404
  );
}

function copySource(bucket: string, key: string): string {
  return encodeURIComponent(`${bucket}/${key}`).replaceAll('%2F', '/');
}

export class AwsS3MediaObjectStore implements MediaObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client,
    private readonly clock: () => Date = () => new Date()
  ) {
    if (bucket.length === 0) throw new TypeError('bucket is required');
  }

  async presignUpload(
    intent: PendingUploadIntent,
    expiresInSeconds: number
  ): Promise<SignedObjectUrl> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: intent.temporaryKey,
        ContentType: intent.contentType,
        ChecksumSHA256: intent.checksumSha256,
      }),
      {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      }
    );
    return {
      url,
      expiresAt: new Date(
        this.clock().getTime() + expiresInSeconds * 1000
      ).toISOString(),
    };
  }

  async presignDownload(
    key: string,
    expiresInSeconds: number
  ): Promise<SignedObjectUrl> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds }
    );
    return {
      url,
      expiresAt: new Date(
        this.clock().getTime() + expiresInSeconds * 1000
      ).toISOString(),
    };
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ChecksumMode: 'ENABLED',
        })
      );
      return {
        contentType: result.ContentType ?? null,
        sizeBytes: result.ContentLength ?? null,
        checksumSha256: result.ChecksumSHA256 ?? null,
        encryption: result.ServerSideEncryption ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async copy(
    sourceKey: string,
    destinationKey: string
  ): Promise<string | null> {
    const result = await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: copySource(this.bucket, sourceKey),
        ChecksumAlgorithm: 'SHA256',
        MetadataDirective: 'COPY',
      })
    );
    return result.CopyObjectResult?.ChecksumSHA256 ?? null;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}

export function createS3MediaObjectStore(
  bucket: string
): AwsS3MediaObjectStore {
  return new AwsS3MediaObjectStore(bucket, new S3Client({}));
}
