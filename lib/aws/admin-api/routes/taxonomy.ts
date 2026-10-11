import { slugify } from '@/lib/utils/slugify';

import type { RouteHandler } from '../context';
import { ApiConflictError, validation } from '../errors';
import {
  expectedVersion,
  parseBody,
  pathId,
  recordBody,
  requireIdempotencyKey,
  response,
  stringField,
  validateId,
} from '../http';
import {
  mutationDigest,
  requiredReservation,
  reservationResult,
  resultString,
} from '../idempotency';
import {
  AdminStoreNotFoundError,
  type AdminCategory,
  type AdminKeyword,
} from '../store';

function parseCategory(
  value: unknown,
  id?: string
): Pick<AdminCategory, 'id' | 'slug' | 'names'> {
  const record = recordBody(value);
  const names = recordBody(record.names);
  const parsedId = validateId(id ?? record.id);
  if (id !== undefined && record.id !== undefined && record.id !== id) {
    throw validation('id', 'ID_MISMATCH', 'Body ID must match the route ID');
  }
  const slug = stringField(record, 'slug', 'slug', 120);
  if (slugify(slug) !== slug) {
    throw validation('slug', 'SLUG_NOT_NORMALIZED', 'Slug must be normalized');
  }
  return {
    id: parsedId,
    slug,
    names: {
      ca: stringField(names, 'ca', 'names.ca', 200),
      en: stringField(names, 'en', 'names.en', 200),
    },
  };
}

function parseAdminKeyword(
  value: unknown,
  id?: string
): Pick<AdminKeyword, 'id' | 'language' | 'value'> {
  const record = recordBody(value);
  const parsedId = validateId(id ?? record.id);
  if (id !== undefined && record.id !== undefined && record.id !== id) {
    throw validation('id', 'ID_MISMATCH', 'Body ID must match the route ID');
  }
  if (record.language !== 'ca' && record.language !== 'en') {
    throw validation(
      'language',
      'INVALID_LANGUAGE',
      'Language must be ca or en'
    );
  }
  return {
    id: parsedId,
    language: record.language,
    value: stringField(record, 'value', 'value', 60),
  };
}

const listCategories: RouteHandler = async ({ requestId, dependencies }) => {
  const categories = await dependencies.store.listCategories();
  return response(200, { data: { items: categories } }, requestId);
};

const createCategory: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const category = parseCategory(parseBody(event));
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest(category),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.store.getCategory(
      resultString(replay, 'categoryId')
    );
    if (!existing) throw new AdminStoreNotFoundError('category');
    return response(
      200,
      { data: { category: existing, replayed: true } },
      requestId,
      { etag: `"${existing.version}"` }
    );
  }
  const created = await dependencies.store.createCategory(category);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    categoryId: created.id,
  });
  return response(
    201,
    { data: { category: created, replayed: false } },
    requestId,
    { etag: `"${created.version}"` }
  );
};

const updateCategory: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const id = pathId(event);
  const category = parseCategory(parseBody(event), id);
  const version = expectedVersion(event);
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ category, version }),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.store.getCategory(id);
    if (!existing) throw new AdminStoreNotFoundError('category');
    return response(
      200,
      { data: { category: existing, replayed: true } },
      requestId,
      { etag: `"${existing.version}"` }
    );
  }
  const updated = await dependencies.store.updateCategory(category, version);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    categoryId: id,
  });
  return response(
    200,
    { data: { category: updated, replayed: false } },
    requestId,
    { etag: `"${updated.version}"` }
  );
};

const deleteCategory: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const id = pathId(event);
  const version = expectedVersion(event);
  const inUse = await dependencies.posts.list({ limit: 1, categoryId: id });
  if (inUse.items.length > 0) {
    throw new ApiConflictError(
      'CATEGORY_IN_USE',
      'Category is referenced by at least one post'
    );
  }
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ id, version }),
  });
  const replay = reservationResult(reservation);
  if (!replay) {
    await dependencies.store.deleteCategory(id, version);
    await dependencies.store.completeMutation(
      requiredReservation(reservation),
      { categoryId: id }
    );
  }
  return response(
    200,
    { data: { categoryId: id, replayed: replay !== null } },
    requestId
  );
};

const listKeywords: RouteHandler = async ({
  event,
  requestId,
  dependencies,
}) => {
  const language = event.queryStringParameters?.language;
  if (language !== undefined && language !== 'ca' && language !== 'en') {
    throw validation(
      'language',
      'INVALID_LANGUAGE',
      'Language must be ca or en'
    );
  }
  const keywords = await dependencies.store.listKeywords(language);
  return response(200, { data: { items: keywords } }, requestId);
};

const createKeyword: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const keyword = parseAdminKeyword(parseBody(event));
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest(keyword),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.store.getKeyword(
      resultString(replay, 'keywordId')
    );
    if (!existing) throw new AdminStoreNotFoundError('keyword');
    return response(
      200,
      { data: { keyword: existing, replayed: true } },
      requestId,
      { etag: `"${existing.version}"` }
    );
  }
  const created = await dependencies.store.createKeyword(keyword);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    keywordId: created.id,
  });
  return response(
    201,
    { data: { keyword: created, replayed: false } },
    requestId,
    { etag: `"${created.version}"` }
  );
};

const updateKeyword: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
}) => {
  const id = pathId(event);
  const keyword = parseAdminKeyword(parseBody(event), id);
  const version = expectedVersion(event);
  const key = requireIdempotencyKey(event);
  const reservation = await dependencies.store.reserveMutation({
    scope: routeKey,
    subject: admin.subject,
    key,
    requestDigest: mutationDigest({ keyword, version }),
  });
  const replay = reservationResult(reservation);
  if (replay) {
    const existing = await dependencies.store.getKeyword(id);
    if (!existing) throw new AdminStoreNotFoundError('keyword');
    return response(
      200,
      { data: { keyword: existing, replayed: true } },
      requestId,
      { etag: `"${existing.version}"` }
    );
  }
  const updated = await dependencies.store.updateKeyword(keyword, version);
  await dependencies.store.completeMutation(requiredReservation(reservation), {
    keywordId: id,
  });
  return response(
    200,
    { data: { keyword: updated, replayed: false } },
    requestId,
    { etag: `"${updated.version}"` }
  );
};

const deleteKeyword: RouteHandler = async ({
  event,
  routeKey,
  requestId,
  admin,
  dependencies,
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
  if (!replay) {
    await dependencies.store.deleteKeyword(id, version);
    await dependencies.store.completeMutation(
      requiredReservation(reservation),
      { keywordId: id }
    );
  }
  return response(
    200,
    { data: { keywordId: id, replayed: replay !== null } },
    requestId
  );
};

export const taxonomyRoutes = {
  'GET /categories': listCategories,
  'POST /categories': createCategory,
  'PUT /categories/{id}': updateCategory,
  'DELETE /categories/{id}': deleteCategory,
  'GET /keywords': listKeywords,
  'POST /keywords': createKeyword,
  'PUT /keywords/{id}': updateKeyword,
  'DELETE /keywords/{id}': deleteKeyword,
} satisfies Record<string, RouteHandler>;
