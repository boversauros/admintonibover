import { INITIAL_CATEGORY_CATALOG } from '@/lib/domain/categories/catalog';
import {
  emptyImageInventoryCounts,
  imageInventoryStatus,
  type ImageInventoryCounts,
  type ImageInventoryStatus,
} from '@/lib/domain/media/contracts';
import type { Post, PostImage, PostListItem } from '@/lib/domain/posts/types';
import {
  parseAdminApiErrorEnvelope,
  parseCategoriesEnvelope,
  parseKeywordsEnvelope,
  parsePostDetailEnvelope,
  parsePostListEnvelope,
  type AdminApiSuccessEnvelope,
} from '@/lib/aws/admin-read-contract';
import type { StoredPost } from '@/lib/types/post';

import { redirectIfSessionExpired } from '../auth/client-session';

export const AWS_ADMIN_POST_PAGE_LIMIT = 50;

export type AdminPostSummary = {
  id: string;
  categoryId: string;
  categorySlug: string;
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  updatedAt: string;
  version?: number;
  titles: { ca: string; en: string };
  excerpts: { ca: string; en: string };
  keywords: { ca: string[]; en: string[] };
  mainImageKey?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
};

export type AdminPostPage = {
  items: AdminPostSummary[];
  nextCursor: string | null;
  requestId?: string;
  totalCount?: number;
  unpublishedCount?: number;
};

export function resolveUnpublishedCount(
  currentCount: number | undefined,
  refreshedCount: number | undefined
): number | undefined {
  return refreshedCount ?? currentCount;
}

export type AdminPostListOptions = {
  limit: number;
  cursor?: string;
  direction: 'ascending' | 'descending';
  title?: string;
  published?: boolean;
  categoryId?: string;
  imageStatus?: ImageInventoryStatus;
  signal?: AbortSignal;
};

export type AdminCategory = {
  id: string;
  slug: string;
  nameCa: string;
  nameEn: string;
};

export type AdminKeywordsByLanguage = {
  ca: string[];
  en: string[];
};

export class AdminReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryAfter?: string
  ) {
    super(message);
    this.name = 'AdminReadError';
  }
}

type EnvelopeParser<T> = (value: unknown) => AdminApiSuccessEnvelope<T>;

function friendlyErrorMessage(status: number, fallback: string): string {
  if (status === 401) return 'La sessió ha caducat. Torna a iniciar sessió.';
  if (status === 403) return 'No tens permisos per consultar aquestes dades.';
  if (status === 404) return 'No s’han trobat les dades sol·licitades.';
  if (status === 409) {
    return 'Les dades han canviat durant la consulta. Torna-ho a provar.';
  }
  if (status === 429) {
    return 'S’han fet massa consultes. Espera un moment i torna-ho a provar.';
  }
  if (status === 504) {
    return 'La consulta ha trigat massa. Comprova la connexió i torna-ho a provar.';
  }
  if (status >= 500) {
    return 'El servei de lectura no està disponible ara mateix.';
  }
  return fallback;
}

async function requestAwsRead<T>(
  path: string,
  parser: EnvelopeParser<T>,
  signal?: AbortSignal
): Promise<AdminApiSuccessEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
      headers: {
        accept: 'application/json',
        'x-correlation-id': crypto.randomUUID(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AdminReadError(
      'No s’ha pogut contactar amb el servei de lectura.',
      0,
      'NETWORK_ERROR'
    );
  }

  redirectIfSessionExpired(response);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    try {
      return parser(payload);
    } catch {
      throw new AdminReadError(
        'El servei ha retornat una resposta que no es pot validar.',
        502,
        'INVALID_RESPONSE',
        response.headers.get('x-correlation-id') ?? undefined
      );
    }
  }

  try {
    const envelope = parseAdminApiErrorEnvelope(payload);
    throw new AdminReadError(
      friendlyErrorMessage(response.status, envelope.error.message),
      response.status,
      envelope.error.code,
      envelope.requestId,
      response.headers.get('retry-after') ?? undefined
    );
  } catch (error) {
    if (error instanceof AdminReadError) throw error;
    throw new AdminReadError(
      friendlyErrorMessage(
        response.status,
        'No s’ha pogut completar la consulta.'
      ),
      response.status,
      'INVALID_ERROR_RESPONSE',
      response.headers.get('x-correlation-id') ?? undefined,
      response.headers.get('retry-after') ?? undefined
    );
  }
}

function awsSummary(post: PostListItem): AdminPostSummary {
  return {
    id: post.id,
    categoryId: post.category.id,
    categorySlug: post.category.slug,
    sortOrder: post.sortOrder,
    published: post.published,
    date: post.date,
    author: post.author,
    updatedAt: post.updatedAt,
    version: post.version,
    titles: { ...post.titles },
    excerpts: { ...post.excerpts },
    keywords: {
      ca: [...post.keywords.ca],
      en: [...post.keywords.en],
    },
    ...(post.mainImage ? { mainImageKey: post.mainImage.key } : {}),
    ...(post.thumbImage ? { thumbnailKey: post.thumbImage.key } : {}),
  };
}

function awsImage(image: PostImage | null): StoredPost['image'] {
  if (!image) return null;
  return {
    id: image.key,
    key: image.key,
    title: image.title,
    alt: image.alt,
    created_at: image.createdAt,
    updated_at: image.updatedAt,
  };
}

export function adaptAwsPost(post: Post): StoredPost {
  return {
    id: post.id,
    user_id: '',
    category_id: post.category.id,
    sort_order: post.sortOrder,
    thumbnail_id: post.thumbImage?.key ?? null,
    thumbnail: awsImage(post.thumbImage),
    image_id: post.mainImage?.key ?? null,
    image: awsImage(post.mainImage),
    is_published: post.published,
    date: post.date,
    author: post.author,
    created_at: post.createdAt,
    updated_at: post.updatedAt,
    version: post.version,
    aws_post: structuredClone(post),
    translations: {
      ca: {
        language: 'ca',
        post_id: post.id,
        title: post.translations.ca.title,
        content: post.translations.ca.content,
        slug: post.translations.ca.slug,
        keywords: post.translations.ca.keywords.map(keyword => keyword.value),
        references: post.translations.ca.references.map(reference => ({
          id: reference.id,
          type: reference.type,
          reference: reference.reference,
          blockquote: reference.blockquote ?? '',
          sort_order: reference.sortOrder,
        })),
      },
      en: {
        language: 'en',
        post_id: post.id,
        title: post.translations.en.title,
        content: post.translations.en.content,
        slug: post.translations.en.slug,
        keywords: post.translations.en.keywords.map(keyword => keyword.value),
        references: post.translations.en.references.map(reference => ({
          id: reference.id,
          type: reference.type,
          reference: reference.reference,
          blockquote: reference.blockquote ?? '',
          sort_order: reference.sortOrder,
        })),
      },
    },
  };
}

export async function getAdminPostsPage(
  options: AdminPostListOptions
): Promise<AdminPostPage> {
  const query = new URLSearchParams({
    limit: String(options.limit),
    direction: options.direction,
  });
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.title) query.set('title', options.title);
  if (options.published !== undefined) {
    query.set('published', String(options.published));
  }
  if (options.categoryId) query.set('categoryId', options.categoryId);
  if (options.imageStatus) query.set('imageStatus', options.imageStatus);
  const response = await requestAwsRead(
    `/api/aws/posts?${query.toString()}`,
    parsePostListEnvelope,
    options.signal
  );
  return {
    items: response.data.items.map(awsSummary),
    nextCursor: response.data.nextCursor,
    requestId: response.requestId,
  };
}

export async function getAdminImageInventory(
  signal?: AbortSignal
): Promise<ImageInventoryCounts> {
  const counts = emptyImageInventoryCounts();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await getAdminPostsPage({
      limit: AWS_ADMIN_POST_PAGE_LIMIT,
      cursor,
      direction: 'ascending',
      signal,
    });
    for (const post of page.items) {
      counts[
        imageInventoryStatus({
          mainImage: post.mainImageKey,
          thumbImage: post.thumbnailKey,
        })
      ] += 1;
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new AdminReadError(
          'La paginació de l’inventari d’imatges no és consistent.',
          502,
          'CURSOR_LOOP'
        );
      }
      seenCursors.add(cursor);
    }
  } while (cursor);
  return counts;
}

export async function getAdminPostById(
  postId: string,
  signal?: AbortSignal
): Promise<StoredPost | null> {
  try {
    const response = await requestAwsRead(
      `/api/aws/posts/${encodeURIComponent(postId)}`,
      parsePostDetailEnvelope,
      signal
    );
    return adaptAwsPost(response.data.post);
  } catch (error) {
    if (error instanceof AdminReadError && error.status === 404) return null;
    throw error;
  }
}

export async function getAdminCategories(
  signal?: AbortSignal
): Promise<AdminCategory[]> {
  const response = await requestAwsRead(
    '/api/aws/categories',
    parseCategoriesEnvelope,
    signal
  );
  const categories = response.data.items.map(category => ({
    id: category.id,
    slug: category.slug,
    nameCa: category.names.ca,
    nameEn: category.names.en,
  }));
  return mergeInitialCategories(categories);
}

function mergeInitialCategories(
  storedCategories: AdminCategory[]
): AdminCategory[] {
  const unmatchedStoredCategories = [...storedCategories];
  const initialCategories = INITIAL_CATEGORY_CATALOG.map(initialCategory => {
    const storedIndex = unmatchedStoredCategories.findIndex(
      storedCategory =>
        storedCategory.id === initialCategory.id ||
        storedCategory.slug === initialCategory.slug
    );
    if (storedIndex >= 0) {
      return unmatchedStoredCategories.splice(storedIndex, 1)[0];
    }
    return {
      id: initialCategory.id,
      slug: initialCategory.slug,
      nameCa: initialCategory.names.ca,
      nameEn: initialCategory.names.en,
    };
  });

  return [...initialCategories, ...unmatchedStoredCategories];
}

export async function getAdminKeywords(
  signal?: AbortSignal
): Promise<AdminKeywordsByLanguage> {
  const response = await requestAwsRead(
    '/api/aws/keywords',
    parseKeywordsEnvelope,
    signal
  );
  return response.data.items.reduce<AdminKeywordsByLanguage>(
    (keywords, item) => {
      keywords[item.language].push(item.value);
      return keywords;
    },
    { ca: [], en: [] }
  );
}
