import type { CognitoGroup } from '@/lib/auth/cognito/groups';
import type {
  ConfirmedImageUpload,
  MediaInspection,
  PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import type { validateUploadDescriptor } from '@/lib/domain/media/validation';
import type { PostRepository } from '@/lib/domain/posts/repository';
import type { BackupEnvironment } from '@/lib/aws/backup-contract';
import type { MediaObjectStore } from '@/lib/aws/media/object-store';

import type { DynamoDbAdminStore } from './store';
import type { UserManagement } from './users';

export type AdminApiEvent = {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  routeKey?: string;
};

export type AdminApiResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type MediaOperations = {
  inspect(postId: string): Promise<MediaInspection>;
  createUpload(
    postId: string,
    descriptor: ReturnType<typeof validateUploadDescriptor>,
    idempotencyKey: string
  ): Promise<PresignedImageUpload>;
  confirmUpload(input: {
    postId: string;
    uploadId: string;
    title: string;
    alt: string;
    idempotencyKey: string;
  }): Promise<ConfirmedImageUpload>;
};

export type AdminLogger = {
  info(event: Record<string, unknown>): void;
  warn(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
};

export type AdminApiDependencies = {
  posts: PostRepository;
  store: DynamoDbAdminStore;
  media: MediaOperations;
  objects: Pick<MediaObjectStore, 'delete' | 'presignDownload'>;
  environment: BackupEnvironment;
  users?: UserManagement;
  security: {
    issuer: string;
    clientId: string;
    allowedGroups: readonly CognitoGroup[];
  };
  clock?: () => Date;
  logger?: AdminLogger;
};

export type AuthenticatedAdmin = {
  groups: CognitoGroup[];
  subject: string;
};

/** Everything a route handler needs; built once per request by the dispatcher. */
export type RouteContext = {
  event: AdminApiEvent;
  /** The matched API Gateway route key; also the idempotency scope. */
  routeKey: string;
  requestId: string;
  admin: AuthenticatedAdmin;
  dependencies: AdminApiDependencies;
  clock: () => Date;
  logger: AdminLogger;
};

export type RouteHandler = (context: RouteContext) => Promise<AdminApiResponse>;
