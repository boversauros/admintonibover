import type { PendingUploadIntent } from './types';

export type StoredObjectMetadata = {
  contentType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  encryption: string | null;
};

export type SignedObjectUrl = {
  url: string;
  expiresAt: string;
};

export interface MediaObjectStore {
  presignUpload(
    intent: PendingUploadIntent,
    expiresInSeconds: number
  ): Promise<SignedObjectUrl>;
  presignDownload(
    key: string,
    expiresInSeconds: number
  ): Promise<SignedObjectUrl>;
  head(key: string): Promise<StoredObjectMetadata | null>;
  copy(sourceKey: string, destinationKey: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}
