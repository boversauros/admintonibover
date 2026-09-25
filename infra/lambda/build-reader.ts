import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

import { createBuildReader } from '@/lib/aws/build-reader/handler';
import { AwsDynamoDbPort } from '@/lib/aws/dynamodb/aws-port';
import { DynamoDbPostRepository } from '@/lib/aws/dynamodb/post-repository';
import { AwsS3MediaObjectStore } from '@/lib/aws/media/aws-s3-object-store';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

let reader: ReturnType<typeof createBuildReader> | undefined;

export async function handler(event: unknown) {
  if (!reader) {
    const environment = required('READER_ENVIRONMENT');
    if (environment !== 'dev')
      throw new Error('Unsupported reader environment');
    const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
    const dynamodb = new AwsDynamoDbPort(
      required('CONTENT_TABLE_NAME'),
      documentClient
    );
    const posts = new DynamoDbPostRepository(dynamodb);
    reader = createBuildReader({
      environment,
      dynamodb,
      posts,
      objects: new AwsS3MediaObjectStore(
        required('CONTENT_BUCKET_NAME'),
        new S3Client({})
      ),
    });
  }
  return reader(event);
}
