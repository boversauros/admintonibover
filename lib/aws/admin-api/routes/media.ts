import type { ImageRole } from '@/lib/domain/media/contracts';
import {
  validateImageText,
  validateUploadDescriptor,
} from '@/lib/domain/media/validation';
import { PostVersionConflictError } from '@/lib/domain/posts/errors';

import type { AdminApiEvent, RouteHandler } from '../context';
import { validation } from '../errors';
import {
  expectedVersion,
  parseBody,
  pathId,
  recordBody,
  response,
} from '../http';
import { cleanupImages } from '../image-cleanup';

const UPLOAD_ID_PATTERN = /^[a-f0-9]{64}$/;

function pathImageRole(event: AdminApiEvent): ImageRole {
  const role = event.pathParameters?.role;
  if (role !== 'main' && role !== 'thumb') {
    throw validation(
      'role',
      'INVALID_IMAGE_ROLE',
      'Role must be main or thumb'
    );
  }
  return role;
}

function parseConfirmBody(value: unknown): {
  uploadId: string;
  title: string;
  alt: string;
} {
  const record = recordBody(value);
  if (
    typeof record.uploadId !== 'string' ||
    !UPLOAD_ID_PATTERN.test(record.uploadId)
  ) {
    throw validation(
      'uploadId',
      'INVALID_UPLOAD_ID',
      'A valid upload ID is required'
    );
  }
  return {
    uploadId: record.uploadId,
    title: validateImageText(record.title, 'title'),
    alt: validateImageText(record.alt, 'alt'),
  };
}

const inspectImages: RouteHandler = async ({
  event,
  requestId,
  dependencies,
}) => {
  const id = pathId(event);
  const inspection = await dependencies.media.inspect(id);
  return response(200, { data: inspection }, requestId);
};

const presignImage: RouteHandler = async ({
  event,
  requestId,
  dependencies,
}) => {
  const id = pathId(event);
  const descriptor = validateUploadDescriptor(parseBody(event));
  const upload = await dependencies.media.createUpload(id, descriptor);
  return response(201, { data: upload }, requestId);
};

const confirmImage: RouteHandler = async ({
  event,
  requestId,
  dependencies,
}) => {
  const id = pathId(event);
  const body = parseConfirmBody(parseBody(event));
  const confirmed = await dependencies.media.confirmUpload({
    postId: id,
    ...body,
  });
  return response(200, { data: confirmed }, requestId);
};

const detachImage: RouteHandler = async ({
  event,
  requestId,
  dependencies,
  logger,
}) => {
  const id = pathId(event);
  const role = pathImageRole(event);
  const version = expectedVersion(event);
  let postVersion: number;
  let previousImageKey: string | null = null;
  let detached = true;
  let replayed = false;
  try {
    const result = await dependencies.posts.detachImage(id, role, version);
    postVersion = result.version;
    previousImageKey = result.previousImageKey;
    detached = result.detached;
  } catch (error) {
    if (!(error instanceof PostVersionConflictError)) throw error;
    // A retry after a lost response finds its own detach already stored.
    const stored = await dependencies.posts.getById(id);
    const image = role === 'main' ? stored?.mainImage : stored?.thumbImage;
    if (stored?.version !== version + 1 || image !== null) throw error;
    postVersion = stored.version;
    replayed = true;
  }
  const cleanup = previousImageKey
    ? await cleanupImages(
        id,
        [previousImageKey],
        dependencies.objects,
        logger,
        'image_detach',
        role
      )
    : { pending: false, failedCount: 0 };
  return response(
    200,
    {
      data: {
        postId: id,
        postVersion,
        role,
        detached,
        cleanup: { ...cleanup, retryWithSameIdempotencyKey: false },
        replayed,
      },
    },
    requestId
  );
};

export const mediaRoutes = {
  'GET /posts/{id}/images': inspectImages,
  'POST /posts/{id}/images/presign': presignImage,
  'POST /posts/{id}/images/confirm': confirmImage,
  'DELETE /posts/{id}/images/{role}': detachImage,
} satisfies Record<string, RouteHandler>;
