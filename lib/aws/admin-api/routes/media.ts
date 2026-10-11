import type { ImageRole } from '@/lib/domain/media/contracts';
import {
  validateImageText,
  validateUploadDescriptor,
} from '@/lib/domain/media/validation';

import type { AdminApiEvent, RouteHandler } from '../context';
import { validation } from '../errors';
import {
  expectedVersion,
  parseBody,
  pathId,
  recordBody,
  requireIdempotencyKey,
  response,
} from '../http';
import {
  mutationDigest,
  requiredReservation,
  reservationResult,
  resultBoolean,
  resultInteger,
  resultNullableString,
} from '../idempotency';
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
  const upload = await dependencies.media.createUpload(
    id,
    descriptor,
    requireIdempotencyKey(event)
  );
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
    idempotencyKey: requireIdempotencyKey(event),
  });
  return response(200, { data: confirmed }, requestId);
};

const detachImage: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
  logger,
}) => {
  const id = pathId(event);
  const role = pathImageRole(event);
  const version = expectedVersion(event);
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ id, role, version }),
  });
  const replay = reservationResult(reservation);
  let postVersion: number;
  let previousImageKey: string | null;
  let detached: boolean;
  if (replay) {
    postVersion = resultInteger(replay, 'postVersion');
    previousImageKey = resultNullableString(replay, 'previousImageKey');
    detached = resultBoolean(replay, 'detached');
  } else {
    const result = await dependencies.posts.detachImage(id, role, version);
    postVersion = result.version;
    previousImageKey = result.previousImageKey;
    detached = result.detached;
    await dependencies.store.completeMutation(
      requiredReservation(reservation),
      { postVersion, previousImageKey, detached }
    );
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
        cleanup: {
          ...cleanup,
          retryWithSameIdempotencyKey: cleanup.pending,
        },
        replayed: replay !== null,
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
