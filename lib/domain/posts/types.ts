export const POST_LANGUAGES = ['ca', 'en'] as const;

export type PostLanguage = (typeof POST_LANGUAGES)[number];
export type PostReferenceType = 'image' | 'text';
export type TranslationStatus = 'complete' | 'incomplete';

export type PostCategory = {
  id: string;
  slug: string;
};

export type PostKeyword = {
  id: string;
  value: string;
};

export type PostReference = {
  id: string;
  type: PostReferenceType;
  reference: string;
  blockquote?: string;
  sortOrder: number;
};

export type PostTranslation = {
  id: string;
  title: string;
  content: string;
  slug: string;
  keywords: PostKeyword[];
  references: PostReference[];
  translationStatus: TranslationStatus;
};

export type PostImage = {
  key: string;
  title: string;
  alt: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type PostMigrationMetadata = {
  source: 'supabase-backup';
  runId: string;
};

export type Post = {
  id: string;
  category: PostCategory;
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  translations: Record<PostLanguage, PostTranslation>;
  mainImage: PostImage | null;
  thumbImage: PostImage | null;
  version: number;
  migration: PostMigrationMetadata | null;
};

export type PostListItem = {
  id: string;
  category: PostCategory;
  sortOrder: number;
  published: boolean;
  date: string;
  author: string;
  updatedAt: string;
  version: number;
  titles: Record<PostLanguage, string>;
  excerpts: Record<PostLanguage, string>;
  keywords: Record<PostLanguage, string[]>;
  thumbImage: PostImage | null;
};
