import { Language } from "./types";

// ==========================================
// V2 Types - Translation-based architecture
// ==========================================

// Core entities that are language-agnostic
export interface PostV2 {
  id: number;
  user_id: string;
  category_id: number;
  image_id: number | null;
  thumbnail_id: number | null;
  is_published: boolean;
  date: Date;
  created_at: Date;
  updated_at: Date;
  // Relations
  translations?: PostTranslationV2[];
  image?: ImageDataV2 | null;
  thumbnail?: ImageDataV2 | null;
  category?: CategoryV2;
  author?: UserV2;
}

// Language-specific content
export interface PostTranslationV2 {
  id: number;
  post_id: number;
  language: Language;
  title: string;
  content: string;
  slug: string;
  references_images: string[];
  references_texts: string[];
  created_at: Date;
  updated_at: Date;
  // Relations
  keywords?: KeywordV2[];
  post?: PostV2;
}

// Keywords are language-specific
export interface KeywordV2 {
  id: number;
  keyword: string;
  language: Language;
  created_at: Date;
  updated_at: Date;
}

// Junction table for many-to-many relationship
export interface PostTranslationKeywordV2 {
  post_translation_id: number;
  keyword_id: number;
}

// Same as before but with V2 suffix for clarity
export interface CategoryV2 {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface ImageDataV2 {
  id: number;
  url: string;
  title: string;
  alt?: string;
  created_at: Date;
  updated_at: Date;
  file?: File; // For new uploads before saving
}

export interface UserV2 {
  id: string; // UUID
  email: string;
  created_at: Date;
}

// ==========================================
// Form/UI specific types
// ==========================================

// Combined type for UI that merges post and its translations
export interface PostWithTranslationsV2 {
  // Core post data
  id: number;
  user_id: string;
  category_id: number;
  image_id: number | null;
  thumbnail_id: number | null;
  is_published: boolean;
  date: Date;
  created_at: Date;
  updated_at: Date;

  // Relations
  image?: ImageDataV2 | null;
  thumbnail?: ImageDataV2 | null;
  category?: CategoryV2;
  author?: UserV2;

  // Translations mapped by language
  translations: {
    ca?: PostTranslationV2;
    en?: PostTranslationV2;
  };

  // Current active translation for editing
  activeLanguage: Language;
}

// Form data for creating/updating posts with translations
export interface PostFormDataV2 {
  // Core post fields
  category_id: number;
  image_id: number | null;
  thumbnail_id: number | null;
  is_published: boolean;
  date: Date;

  // Translation data for each language
  translations: {
    ca?: {
      title: string;
      content: string;
      slug?: string;
      keywords: string[];
      references_images: string[];
      references_texts: string[];
    };
    en?: {
      title: string;
      content: string;
      slug?: string;
      keywords: string[];
      references_images: string[];
      references_texts: string[];
    };
  };
}

// ==========================================
// API Response types
// ==========================================

export interface ApiResponseV2<T> {
  data?: T;
  error?: string;
}

// Response when fetching a post with all its translations
export interface PostDetailResponseV2 {
  post: PostV2;
  translations: PostTranslationV2[];
}

// Response for listing posts (might include default translation)
export interface PostListItemV2 {
  id: number;
  category_id: number;
  is_published: boolean;
  date: Date;
  created_at: Date;
  updated_at: Date;
  image?: ImageDataV2 | null;
  thumbnail?: ImageDataV2 | null;
  // Default translation (e.g., Catalan)
  default_translation?: {
    title: string;
    slug: string;
    language: Language;
  };
  // Count of available translations
  translation_count: number;
}

// ==========================================
// Service method signatures
// ==========================================

export interface PostsServiceV2Interface {
  // Core CRUD operations
  getAll(): Promise<ApiResponseV2<PostListItemV2[]>>;
  getById(id: number): Promise<ApiResponseV2<PostDetailResponseV2>>;
  create(data: PostFormDataV2): Promise<ApiResponseV2<PostDetailResponseV2>>;
  update(
    id: number,
    data: Partial<PostFormDataV2>
  ): Promise<ApiResponseV2<PostDetailResponseV2>>;
  delete(id: number): Promise<ApiResponseV2<void>>;

  // Translation-specific operations
  getTranslation(
    postId: number,
    language: Language
  ): Promise<ApiResponseV2<PostTranslationV2>>;
  createTranslation(
    postId: number,
    language: Language,
    data: Omit<
      PostTranslationV2,
      "id" | "post_id" | "language" | "created_at" | "updated_at"
    >
  ): Promise<ApiResponseV2<PostTranslationV2>>;
  updateTranslation(
    translationId: number,
    data: Partial<PostTranslationV2>
  ): Promise<ApiResponseV2<PostTranslationV2>>;
  deleteTranslation(translationId: number): Promise<ApiResponseV2<void>>;

  // Utility operations
  togglePublish(id: number): Promise<ApiResponseV2<PostV2>>;
  generateSlug(title: string, language: Language): string;
}

// ==========================================
// Utility types
// ==========================================

// Helper to extract translation data from a post
export type ExtractTranslation<
  T extends PostWithTranslationsV2,
  L extends Language
> = T["translations"][L];

// Helper to check if a translation exists
export type HasTranslation<
  T extends PostWithTranslationsV2,
  L extends Language
> = T["translations"][L] extends PostTranslationV2 ? true : false;
