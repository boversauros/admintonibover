import { PostNotFoundError } from '@/lib/domain/posts/errors';
import type { Post, PostImage } from '@/lib/domain/posts/types';

import type { RouteHandler } from '../context';
import { ApiConflictError, validation } from '../errors';
import {
  booleanField,
  errorResponse,
  expectedVersion,
  ID_PATTERN,
  isRecord,
  numberField,
  parseBody,
  pathId,
  postResponse,
  recordBody,
  requireIdempotencyKey,
  response,
} from '../http';
import {
  mutationDigest,
  requiredReservation,
  reservationResult,
  resultString,
  resultStrings,
} from '../idempotency';
import { cleanupImages } from '../image-cleanup';
import { parseListOptions, parsePost } from '../post-parsing';
import type { MutationReservation } from '../store';

const MAX_BULK_POSTS = 100;

/**
 * Images are attached only through presign/confirm, so a post update keeps the
 * stored image and accepts nothing but its alt text, and only when the body
 * names the same object key.
 */
function keepImageWithAlt(
  stored: PostImage | null,
  submitted: PostImage | null
): PostImage | null {
  if (!stored || submitted?.key !== stored.key) return stored;
  return { ...stored, alt: submitted.alt };
}

type BulkPublicationTarget = { id: string; version: number };

function bulkPublicationTargets(
  reservation: Extract<MutationReservation, { state: 'reserved' }>
): BulkPublicationTarget[] {
  const context = reservation.context;
  if (
    !context ||
    context.operation !== 'bulk-publication-v1' ||
    !Array.isArray(context.targets)
  ) {
    throw new TypeError('Stored bulk publication context is invalid');
  }
  return context.targets.map((value, index) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !ID_PATTERN.test(value.id) ||
      !Number.isSafeInteger(value.version) ||
      (value.version as number) < 1
    ) {
      throw new TypeError(`Stored bulk publication target ${index} is invalid`);
    }
    return { id: value.id, version: value.version as number };
  });
}

const listPosts: RouteHandler = async ({ event, requestId, dependencies }) => {
  const page = await dependencies.posts.list(parseListOptions(event));
  return response(200, { data: page }, requestId);
};

const createPost: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const post = parsePost(parseBody(event));
  if (
    post.migration !== null ||
    post.mainImage !== null ||
    post.thumbImage !== null
  ) {
    throw validation(
      'body',
      'READ_ONLY_FIELDS',
      'New posts cannot set migration metadata or image objects'
    );
  }
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest(post),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.posts.getById(
      resultString(replay, 'postId')
    );
    if (!existing) {
      throw new ApiConflictError(
        'IDEMPOTENCY_RESULT_GONE',
        'The original mutation result no longer exists'
      );
    }
    return postResponse(200, existing, requestId, true);
  }
  const created = await dependencies.posts.create(post);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    postId: created.id,
  });
  return postResponse(201, created, requestId);
};

const publishAllDrafts: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const body = recordBody(parseBody(event));
  if (body.published !== true || body.confirmation !== 'PUBLISH_ALL') {
    throw validation(
      'confirmation',
      'CONFIRMATION_REQUIRED',
      'Bulk publication requires published=true and confirmation=PUBLISH_ALL'
    );
  }
  const expectedCount = numberField(body, 'expectedCount', 'expectedCount', 1);
  if (expectedCount > MAX_BULK_POSTS) {
    throw validation(
      'expectedCount',
      'BULK_LIMIT_EXCEEDED',
      `Bulk publication is capped at ${MAX_BULK_POSTS} posts`
    );
  }
  const key = requireIdempotencyKey(event);
  const reservationInput = {
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest(body),
    resumePending: true,
  } as const;
  let reservation = await dependencies.store.findMutation(reservationInput);
  if (!reservation) {
    let cursor: string | undefined;
    const drafts: BulkPublicationTarget[] = [];
    do {
      const page = await dependencies.posts.list({
        limit: 50,
        cursor,
        published: false,
        direction: 'ascending',
      });
      drafts.push(
        ...page.items.map(item => ({ id: item.id, version: item.version }))
      );
      if (drafts.length > MAX_BULK_POSTS) {
        throw new ApiConflictError(
          'BULK_LIMIT_EXCEEDED',
          `Bulk publication is capped at ${MAX_BULK_POSTS} posts`
        );
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    if (drafts.length !== expectedCount) {
      throw new ApiConflictError(
        'BULK_COUNT_MISMATCH',
        `Expected ${expectedCount} drafts but found ${drafts.length}`
      );
    }
    reservation = await dependencies.store.reserveMutation({
      ...reservationInput,
      pendingContext: { operation: 'bulk-publication-v1', targets: drafts },
    });
  }
  const replay = reservationResult(reservation);
  if (replay) {
    return response(
      200,
      { data: { publishedCount: replay.publishedCount, replayed: true } },
      requestId
    );
  }
  const writableReservation = requiredReservation(reservation);
  const targets = bulkPublicationTargets(writableReservation);
  for (const target of targets) {
    const post = await dependencies.posts.getById(target.id);
    if (!post) throw new PostNotFoundError(target.id);
    if (post.published) continue;
    await dependencies.posts.update(
      { ...post, published: true },
      target.version
    );
  }
  const publishedCount = targets.length;
  await dependencies.store.completeMutation(writableReservation, {
    publishedCount,
  });
  return response(
    200,
    { data: { publishedCount, replayed: false } },
    requestId
  );
};

const readPost: RouteHandler = async ({ event, requestId, dependencies }) => {
  const id = pathId(event);
  const post = await dependencies.posts.getById(id);
  return post
    ? postResponse(200, post, requestId)
    : errorResponse(404, 'NOT_FOUND', 'Post not found', requestId);
};

const updatePost: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const id = pathId(event);
  const post = parsePost(parseBody(event));
  if (post.id !== id) {
    throw validation('id', 'ID_MISMATCH', 'Body ID must match the route ID');
  }
  const version = expectedVersion(event);
  const current = await dependencies.posts.getById(id);
  if (!current) throw new PostNotFoundError(id);
  if (post.published !== current.published) {
    throw validation(
      'published',
      'PUBLICATION_ROUTE_REQUIRED',
      'Use the publication route to change publication state'
    );
  }
  const safePost: Post = {
    ...post,
    published: current.published,
    mainImage: keepImageWithAlt(current.mainImage, post.mainImage),
    thumbImage: keepImageWithAlt(current.thumbImage, post.thumbImage),
  };
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ post: safePost, version }),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.posts.getById(id);
    if (!existing) throw new PostNotFoundError(id);
    return postResponse(200, existing, requestId, true);
  }
  const updated = await dependencies.posts.update(safePost, version);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    postId: id,
  });
  return postResponse(200, updated, requestId);
};

const deletePost: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
  logger,
}) => {
  const id = pathId(event);
  const version = expectedVersion(event);
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ id, version }),
  });
  const replay = reservationResult(reservation);
  let imageKeys: string[];
  if (replay) {
    imageKeys = resultStrings(replay, 'imageKeys');
  } else {
    const deleted = await dependencies.posts.delete(id, version);
    imageKeys = deleted.imageKeys;
    await dependencies.store.completeMutation(
      requiredReservation(reservation),
      { postId: deleted.postId, imageKeys }
    );
  }
  const cleanup = await cleanupImages(
    id,
    imageKeys,
    dependencies.objects,
    logger
  );
  return response(
    200,
    {
      data: {
        postId: id,
        cleanup: { ...cleanup, retryWithSameIdempotencyKey: cleanup.pending },
        replayed: replay !== null,
      },
    },
    requestId
  );
};

const setPublication: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const id = pathId(event);
  const body = recordBody(parseBody(event));
  const published = booleanField(body, 'published', 'published');
  const expectedConfirmation = published ? 'PUBLISH' : 'UNPUBLISH';
  if (body.confirmation !== expectedConfirmation) {
    throw validation(
      'confirmation',
      'CONFIRMATION_REQUIRED',
      `Confirmation must be ${expectedConfirmation}`
    );
  }
  const version = expectedVersion(event);
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ id, version, published }),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.posts.getById(id);
    if (!existing) throw new PostNotFoundError(id);
    return postResponse(200, existing, requestId, true);
  }
  const post = await dependencies.posts.getById(id);
  if (!post) throw new PostNotFoundError(id);
  const updated = await dependencies.posts.update(
    { ...post, published },
    version
  );
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    postId: id,
  });
  return postResponse(200, updated, requestId);
};

export const postRoutes = {
  'GET /posts': listPosts,
  'POST /posts': createPost,
  'POST /posts/publication/bulk': publishAllDrafts,
  'GET /posts/{id}': readPost,
  'PUT /posts/{id}': updatePost,
  'DELETE /posts/{id}': deletePost,
  'PUT /posts/{id}/publication': setPublication,
} satisfies Record<string, RouteHandler>;
