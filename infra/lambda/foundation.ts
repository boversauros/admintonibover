import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

import {
  createAdminApiHandler,
  type AdminApiEvent,
  type AdminApiResponse,
} from '@/lib/aws/admin-api/handler';
import { DynamoDbAdminStore } from '@/lib/aws/admin-api/store';
import { AwsDynamoDbPort } from '@/lib/aws/dynamodb/aws-port';
import { DynamoDbMediaIntentRepository } from '@/lib/aws/dynamodb/media-intent-repository';
import { DynamoDbPostRepository } from '@/lib/aws/dynamodb/post-repository';
import { AwsS3MediaObjectStore } from '@/lib/aws/media/aws-s3-object-store';
import { MediaService } from '@/lib/aws/media/service';
import {
  BACKUP_ENVIRONMENTS,
  type BackupEnvironment,
} from '@/lib/aws/backup-contract';

const dynamodb = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamodb, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment setting: ${name}`);
  return value;
}

function backupEnvironment(): BackupEnvironment {
  const value = environment('BACKUP_ENVIRONMENT');
  if (!BACKUP_ENVIRONMENTS.includes(value as BackupEnvironment)) {
    throw new Error('BACKUP_ENVIRONMENT must be dev or prod');
  }
  return value as BackupEnvironment;
}

let cachedHandler:
  | ((event: AdminApiEvent) => Promise<AdminApiResponse>)
  | undefined;

function runtimeHandler() {
  if (cachedHandler) return cachedHandler;
  const port = new AwsDynamoDbPort(
    environment('CONTENT_TABLE_NAME'),
    documentClient
  );
  const posts = new DynamoDbPostRepository(port);
  const store = new DynamoDbAdminStore(port);
  const objects = new AwsS3MediaObjectStore(
    environment('CONTENT_BUCKET_NAME'),
    s3
  );
  const intents = new DynamoDbMediaIntentRepository(port, posts);
  const media = new MediaService(posts, intents, objects, undefined, {
    info: event => console.info(JSON.stringify(event)),
    warn: event => console.warn(JSON.stringify(event)),
  });
  cachedHandler = createAdminApiHandler({
    posts,
    store,
    media,
    objects,
    environment: backupEnvironment(),
    security: {
      issuer: environment('EXPECTED_ISSUER'),
      clientId: environment('EXPECTED_CLIENT_ID'),
      adminScope: environment('REQUIRED_ADMIN_SCOPE'),
    },
    logger: {
      info: event => console.info(JSON.stringify(event)),
      warn: event => console.warn(JSON.stringify(event)),
      error: event => console.error(JSON.stringify(event)),
    },
  });
  return cachedHandler;
}

export async function handler(event: AdminApiEvent): Promise<AdminApiResponse> {
  return runtimeHandler()(event);
}
