import type {
  AllowedImageMimeType,
  ImageRole,
} from '@/lib/domain/media/contracts';

export type PendingUploadIntent = {
  uploadId: string;
  requestDigest: string;
  postId: string;
  role: ImageRole;
  temporaryKey: string;
  permanentKey: string;
  contentType: AllowedImageMimeType;
  sizeBytes: number;
  checksumSha256: string;
  expectedVersion: number;
  createdAt: string;
  expiresAt: number;
  status: 'pending';
};

export type ConfirmedUploadIntent = Omit<PendingUploadIntent, 'status'> & {
  status: 'confirmed';
  confirmDigest: string;
  confirmedAt: string;
  resultVersion: number;
  title: string;
  alt: string;
};

export type UploadIntent = PendingUploadIntent | ConfirmedUploadIntent;
