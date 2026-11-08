import assert from 'node:assert/strict';
import test from 'node:test';

import { AdminMutationError } from '../lib/api/adminMutations';
import type { ImagePreview, ImageRole } from '../lib/domain/media/contracts';
import type { Post, PostImage } from '../lib/domain/posts/types';
import { postFormValues, type PostFormValues } from '../lib/forms/postForm';
import { initialPostRecord, postRecordReducer } from '../lib/forms/postRecord';
import {
  formResetsAfter,
  savePost,
  type SavePostApi,
  type SaveStep,
} from '../lib/forms/savePost';

const NOW = '2026-08-22T10:00:00.000Z';
const CATEGORY = { id: 'category-1', slug: 'reflexions' };

function image(role: ImageRole, name = 'a'): PostImage {
  return {
    key: `images/posts/post-1/${role}/${name}.webp`,
    title: role,
    alt: `${role} alt`,
    contentType: 'image/webp',
    sizeBytes: 1024,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function storedPost(overrides: Partial<Post> = {}): Post {
  const translation = {
    title: 'Títol',
    content: 'Contingut',
    slug: 'titol',
    keywords: [],
    references: [],
    translationStatus: 'complete' as const,
  };
  return {
    id: 'post-1',
    category: CATEGORY,
    sortOrder: 1,
    published: false,
    date: '2026-08-20',
    author: 'Toni Bover',
    createdAt: NOW,
    updatedAt: NOW,
    translations: {
      ca: { ...translation, id: 'translation-ca' },
      en: { ...translation, id: 'translation-en', title: 'Title' },
    },
    mainImage: null,
    thumbImage: null,
    version: 1,
    migration: null,
    ...overrides,
  };
}

function file(name: string): File {
  return new File(['x'], name, { type: 'image/webp' });
}

/** A fake backend that bumps the version on every change, like the Lambda. */
function fakeApi(failOn?: string) {
  const calls: string[] = [];
  let server: Post | null = null;
  const fail = (call: string) => {
    calls.push(call);
    if (failOn && call.startsWith(failOn)) {
      throw new AdminMutationError('Upstream failed', 502, 'UPSTREAM');
    }
  };
  const api: SavePostApi = {
    async create(post) {
      fail(`create:${post.id}`);
      if (server) throw new AdminMutationError('Exists', 409, 'CONFLICT');
      server = { ...post, version: 1 };
      return server;
    },
    async update(post, expectedVersion) {
      fail(`update:v${expectedVersion}`);
      if (!server || server.version !== expectedVersion) {
        throw new AdminMutationError('Stale', 409, 'VERSION_CONFLICT');
      }
      server = { ...post, version: server.version + 1 };
      return server;
    },
    async setPublication(postId, version, published) {
      fail(`publish:${published}:v${version}`);
      server = { ...server!, published, version: version + 1 };
      return server;
    },
    async uploadImage({ postId, postVersion, role }) {
      fail(`upload:${role}:v${postVersion}`);
      const uploaded = image(role, 'new');
      const field = role === 'main' ? 'mainImage' : 'thumbImage';
      server = { ...server!, [field]: uploaded, version: postVersion + 1 };
      const preview: ImagePreview = {
        image: uploaded,
        previewUrl: 'https://preview.invalid/new',
        previewExpiresAt: null,
      };
      return {
        postId,
        postVersion: server.version,
        role,
        image: preview,
        cleanupPending: false,
      };
    },
    async detachImage({ postId, postVersion, role }) {
      fail(`detach:${role}:v${postVersion}`);
      const field = role === 'main' ? 'mainImage' : 'thumbImage';
      server = { ...server!, [field]: null, version: postVersion + 1 };
      return {
        postId,
        postVersion: server.version,
        role,
        detached: true,
        cleanup: {
          pending: false,
          failedCount: 0,
        },
      };
    },
  };
  return {
    api,
    calls,
    seed(post: Post) {
      server = post;
    },
    server: () => server,
  };
}

/** Runs a save the way PostForm does: steps update the record and the form. */
async function save(
  values: PostFormValues,
  api: SavePostApi,
  current: Post | null
) {
  const steps: SaveStep[] = [];
  let record = initialPostRecord(current ?? undefined);
  const onStep = (step: SaveStep) => {
    steps.push(step);
    record = postRecordReducer(record, step);
    // The same resets PostForm applies with setValue.
    const { clearFile, clearRemoval } = formResetsAfter(step);
    if (clearFile) values[clearFile] = null;
    if (clearRemoval) values.removeImage[clearRemoval] = false;
  };
  let error: unknown = null;
  try {
    await savePost(values, {
      api,
      category: CATEGORY,
      current: current ?? undefined,
      now: NOW,
      onStep,
      postId: 'post-new',
    });
  } catch (caught) {
    error = caught;
  }
  return { error, record, steps };
}

test('an edit that fails at the image upload is retried as an update of the saved version', async () => {
  const post = storedPost({ version: 4 });
  const backend = fakeApi('upload:main');
  backend.seed(post);
  const values = postFormValues(post);
  values.mainImageFile = file('main.webp');

  const first = await save(values, backend.api, post);
  assert.ok(first.error instanceof AdminMutationError);
  assert.equal(first.record.post?.version, 5);
  assert.notEqual(values.mainImageFile, null);

  const retry = fakeApi();
  retry.seed(backend.server()!);
  const second = await save(values, retry.api, first.record.post);
  assert.equal(second.error, null);
  assert.deepEqual(retry.calls, ['update:v5', 'upload:main:v6']);
  assert.equal(second.record.post?.version, 7);
  assert.equal(
    second.record.previews.main?.previewUrl,
    'https://preview.invalid/new'
  );
  assert.equal(values.mainImageFile, null);
});

test('a new post whose image upload fails is updated on retry, never created twice', async () => {
  const backend = fakeApi('upload:thumb');
  const values = postFormValues();
  values.categoryId = CATEGORY.id;
  values.thumbImageFile = file('thumb.webp');

  const first = await save(values, backend.api, null);
  assert.ok(first.error instanceof AdminMutationError);
  assert.deepEqual(backend.calls, ['create:post-new', 'upload:thumb:v1']);
  assert.equal(
    first.steps[0]?.type === 'saved' && first.steps[0].created,
    true
  );
  assert.equal(first.record.post?.id, 'post-new');

  const retry = fakeApi();
  retry.seed(backend.server()!);
  const second = await save(values, retry.api, first.record.post);
  assert.equal(second.error, null);
  assert.deepEqual(retry.calls, ['update:v1', 'upload:thumb:v2']);
});

test('unpublishing happens before image changes and publishing after them', async () => {
  const post = storedPost({
    published: true,
    mainImage: image('main'),
    version: 2,
  });
  const backend = fakeApi();
  backend.seed(post);
  const values = postFormValues(post);
  values.published = false;
  values.thumbImageFile = file('thumb.webp');
  values.removeImage.main = true;

  const result = await save(values, backend.api, post);
  assert.equal(result.error, null);
  assert.deepEqual(backend.calls, [
    'update:v2',
    'publish:false:v3',
    'upload:thumb:v4',
    'detach:main:v5',
  ]);
  assert.equal(result.record.post?.mainImage, null);
  assert.equal(result.record.previews.main, null);
  assert.deepEqual(values.removeImage, { main: false, thumb: false });

  values.published = true;
  const backendAgain = fakeApi();
  backendAgain.seed(backend.server()!);
  await save(values, backendAgain.api, result.record.post);
  assert.deepEqual(backendAgain.calls, ['update:v6', 'publish:true:v7']);
});

test('removal is skipped when the post has no saved image in that slot', async () => {
  const post = storedPost();
  const backend = fakeApi();
  backend.seed(post);
  const values = postFormValues(post);
  values.removeImage.thumb = true;

  await save(values, backend.api, post);
  assert.deepEqual(backend.calls, ['update:v1']);
});

test('a version conflict propagates unchanged and nothing after it runs', async () => {
  const post = storedPost({ version: 3 });
  const backend = fakeApi();
  backend.seed({ ...post, version: 4 });
  const values = postFormValues(post);
  values.mainImageFile = file('main.webp');

  const result = await save(values, backend.api, post);
  assert.ok(result.error instanceof AdminMutationError);
  assert.equal(result.error.status, 409);
  assert.deepEqual(backend.calls, ['update:v3']);
  assert.deepEqual(result.steps, []);
});

test('an alt text the backend ignored is reported after everything else is saved', async () => {
  const post = storedPost({ mainImage: image('main') });
  const ignoringAlt = fakeApi();
  ignoringAlt.seed(post);
  const api: SavePostApi = {
    ...ignoringAlt.api,
    update: async (body, version) => {
      const saved = await ignoringAlt.api.update(body, version);
      return { ...saved, mainImage: post.mainImage };
    },
  };
  const values = postFormValues(post);
  values.mainImageAlt = 'Nou alt';
  values.published = true;

  const result = await save(values, api, post);
  assert.ok(result.error instanceof AdminMutationError);
  assert.equal(result.error.code, 'IMAGE_ALT_NOT_SAVED');
  assert.deepEqual(ignoringAlt.calls, ['update:v1', 'publish:true:v2']);
});

test('a saved alt text updates the existing preview; inspection refreshes both', () => {
  const post = storedPost({ mainImage: image('main') });
  let record = initialPostRecord(post);
  assert.equal(record.previews.main?.previewUrl, null);

  const saved = {
    ...post,
    version: 2,
    mainImage: { ...image('main'), alt: 'Nou' },
  };
  record = postRecordReducer(record, {
    type: 'saved',
    post: saved,
    created: false,
  });
  assert.equal(record.previews.main?.image.alt, 'Nou');
  assert.equal(record.previews.thumb, null);

  const thumb: ImagePreview = {
    image: image('thumb'),
    previewUrl: 'https://preview.invalid/thumb',
    previewExpiresAt: null,
  };
  record = postRecordReducer(record, {
    type: 'inspected',
    inspection: {
      postId: post.id,
      postVersion: 5,
      titles: { ca: 'Títol', en: 'Title' },
      images: { main: null, thumb },
    },
  });
  assert.equal(record.post?.version, 5);
  assert.equal(record.post?.mainImage, null);
  assert.deepEqual(record.post?.thumbImage, thumb.image);
  assert.deepEqual(record.previews, { main: null, thumb });
});

test('finished image steps clear the fields that would make a retry repeat them', () => {
  const post = storedPost();
  const preview: ImagePreview = {
    image: image('thumb'),
    previewUrl: null,
    previewExpiresAt: null,
  };
  assert.deepEqual(formResetsAfter({ type: 'saved', post, created: true }), {
    clearFile: null,
    clearRemoval: null,
  });
  assert.deepEqual(
    formResetsAfter({ type: 'uploaded', role: 'thumb', preview, post }),
    { clearFile: 'thumbImageFile', clearRemoval: 'thumb' }
  );
  assert.deepEqual(formResetsAfter({ type: 'detached', role: 'main', post }), {
    clearFile: null,
    clearRemoval: 'main',
  });
});

test('an inspection older than the saved version does not roll the version back', () => {
  const post = storedPost({ version: 3, mainImage: image('main', 'new') });
  const record = initialPostRecord(post);
  const stale = postRecordReducer(record, {
    type: 'inspected',
    inspection: {
      postId: post.id,
      postVersion: 2,
      titles: { ca: 'Títol', en: 'Title' },
      images: { main: null, thumb: null },
    },
  });
  assert.equal(stale, record);
});
