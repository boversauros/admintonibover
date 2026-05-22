export const POST_LIMITS = {
  title: 200,
  content: 50000,
  keyword: 60,
  referenceUrl: 2048,
  referenceText: 2000,
  blockquote: 2000,
  author: 120,
} as const;

const maxLen = (value: number, label: string) => ({
  value,
  message: `${label} max ${value} characters`,
});

export const postValidationRules = {
  category_id: { required: 'Category is required' },
  'translations.ca.title': {
    required: 'Catalan title required',
    maxLength: maxLen(POST_LIMITS.title, 'Catalan title'),
  },
  'translations.en.title': {
    required: 'English title required',
    maxLength: maxLen(POST_LIMITS.title, 'English title'),
  },
  'translations.ca.content': {
    required: 'Catalan content required',
    maxLength: maxLen(POST_LIMITS.content, 'Catalan content'),
  },
  'translations.en.content': {
    required: 'English content required',
    maxLength: maxLen(POST_LIMITS.content, 'English content'),
  },
};
