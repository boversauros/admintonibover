import type { RouteHandler } from '../context';
import { validation } from '../errors';
import { response } from '../http';

const listCategories: RouteHandler = async ({ requestId, dependencies }) => {
  const categories = await dependencies.store.listCategories();
  return response(200, { data: { items: categories } }, requestId);
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

export const taxonomyRoutes = {
  'GET /categories': listCategories,
  'GET /keywords': listKeywords,
} satisfies Record<string, RouteHandler>;
