import { isDeepStrictEqual } from 'node:util';

import { isOwnedImageKey } from '@/lib/aws/media/service';
import { PRESIGNED_URL_TTL_SECONDS } from '@/lib/domain/media/contracts';
import {
  PostNotFoundError,
  PostVersionConflictError,
} from '@/lib/domain/posts/errors';
import type { Post, PostImage } from '@/lib/domain/posts/types';

import type { AdminApiDependencies, RouteHandler } from '../context';
import { ApiConflictError, validation } from '../errors';
import {
  booleanField,
  errorResponse,
  expectedVersion,
  numberField,
  parseBody,
  pathId,
  postResponse,
  recordBody,
  response,
} from '../http';
import { cleanupImages } from '../image-cleanup';
import { parseListOptions, parsePost } from '../post-parsing';

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

/** Whether two posts hold the same content, ignoring server-managed fields. */
function sameContent(left: Post, right: Post): boolean {
  const content = (post: Post) => ({
    ...post,
    version: 0,
    createdAt: '',
    updatedAt: '',
    migration: null,
  });
  return isDeepStrictEqual(content(left), content(right));
}

/**
 * Runs a post write. When the response to an earlier attempt was lost, the
 * browser's retry hits a version conflict against its own write, so a conflict
 * whose stored post `isOwnWrite` recognises counts as success.
 */
async function writeOrRecognise(
  posts: AdminApiDependencies['posts'],
  id: string,
  write: () => Promise<Post>,
  isOwnWrite: (stored: Post) => boolean
): Promise<{ post: Post; replayed: boolean }> {
  try {
    return { post: await write(), replayed: false };
  } catch (error) {
    if (!(error instanceof PostVersionConflictError)) throw error;
    const stored = await posts.getById(id);
    if (!stored || !isOwnWrite(stored)) throw error;
    return { post: stored, replayed: true };
  }
}

const listPosts: RouteHandler = async ({ event, requestId, dependencies }) => {
  const page = await dependencies.posts.list(parseListOptions(event));
  // Thumbnails are private; sign a short-lived preview for each uploaded one.
  // Signing is local, so this adds no S3 request per post.
  const items = await Promise.all(
    page.items.map(async item => {
      const key = item.thumbImage?.key;
      const thumbPreviewUrl =
        key && isOwnedImageKey(item.id, 'thumb', key)
          ? (
              await dependencies.objects.presignDownload(
                key,
                PRESIGNED_URL_TTL_SECONDS
              )
            ).url
          : null;
      return { ...item, thumbPreviewUrl };
    })
  );
  return response(200, { data: { ...page, items } }, requestId);
};

const createPost: RouteHandler = async ({ event, requestId, dependencies }) => {
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
  const { post: created, replayed } = await writeOrRecognise(
    dependencies.posts,
    post.id,
    () => dependencies.posts.create(post),
    stored => stored.version === 1 && sameContent(stored, post)
  );
  return postResponse(replayed ? 200 : 201, created, requestId, replayed);
};

const publishAllDrafts: RouteHandler = async ({
  event,
  requestId,
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
  let cursor: string | undefined;
  const drafts: { id: string; version: number }[] = [];
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
  for (const target of drafts) {
    const post = await dependencies.posts.getById(target.id);
    if (!post) throw new PostNotFoundError(target.id);
    if (post.published) continue;
    await dependencies.posts.update(
      { ...post, published: true },
      target.version
    );
  }
  return response(
    200,
    { data: { publishedCount: drafts.length, replayed: false } },
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

const updatePost: RouteHandler = async ({ event, requestId, dependencies }) => {
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
  const { post: updated, replayed } = await writeOrRecognise(
    dependencies.posts,
    id,
    () => dependencies.posts.update(safePost, version),
    stored => stored.version === version + 1 && sameContent(stored, safePost)
  );
  return postResponse(200, updated, requestId, replayed);
};

const deletePost: RouteHandler = async ({
  event,
  requestId,
  dependencies,
  logger,
}) => {
  const id = pathId(event);
  const version = expectedVersion(event);
  let imageKeys: string[] = [];
  let replayed = false;
  try {
    ({ imageKeys } = await dependencies.posts.delete(id, version));
  } catch (error) {
    // A retry after a lost response finds the post already gone.
    if (!(error instanceof PostNotFoundError)) throw error;
    replayed = true;
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
        cleanup: { ...cleanup, retryWithSameIdempotencyKey: false },
        replayed,
      },
    },
    requestId
  );
};

const setPublication: RouteHandler = async ({
  event,
  requestId,
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
  const post = await dependencies.posts.getById(id);
  if (!post) throw new PostNotFoundError(id);
  const { post: updated, replayed } = await writeOrRecognise(
    dependencies.posts,
    id,
    () => dependencies.posts.update({ ...post, published }, version),
    stored => stored.version === version + 1 && stored.published === published
  );
  return postResponse(200, updated, requestId, replayed);
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
