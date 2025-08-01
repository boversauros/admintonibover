export type Language = "ca" | "en";

export interface Post {
  id: number;
  title: string;
  category_id: number;
  content: string;
  language: Language;
  image_id: number | null;
  thumbnail_id: number | null;
  keywords: string[];
  references: PostReferences;
  created_at: Date;
  updated_at: Date;
  is_published: boolean;
  date: Date;
  user_id: string;
  author?: string;
  slug?: string;
  tags?: string[];
  // These are populated by the API
  image?: ImageData | null;
  thumbnail?: ImageData | null;
}

export interface Category {
  id: number;
  name: string;
}

export interface ImageData {
  id: number;
  url: string;
  title: string;
  alt?: string;
  file?: File; // For new uploads before saving
  created_at?: Date;
  updated_at?: Date;
}

export interface PostReferences {
  images: string[];
  texts: string[];
}

export interface PostTranslation {
  id: number;
  post_id: number;
  title: string;
  content: string;
  slug: string;
  references_images?: string;
  references_texts?: string;
  language_id: number;
}

export interface PostKeyword {
  post_translation_id: number;
  keyword_id: number;
}

export interface Keyword {
  id: number;
  keyword: string;
  language_id: number;
}

export interface User {
  id: string; // UUID
  email: string;
  created_at: Date;
}

// Form-specific types
export interface PostFormData
  extends Omit<Post, "id" | "created_at" | "updated_at" | "user_id"> {
  id?: number; // Optional for new posts
}

// Helper type for API responses
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
