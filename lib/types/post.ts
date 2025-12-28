export type Language = 'ca' | 'en';
export type ReferenceType = 'image' | 'text';

export interface Image {
  id: string;
  url: string;
  title: string;
  alt: string;
  created_at: string;
  updated_at: string;
}

export interface Reference {
  id: string;
  type: ReferenceType;
  reference: string;
  blockquote: string;
  sort_order: number;
}

export interface PostTranslation {
  language: Language;
  title: string;
  content: string;
  slug: string;
  keywords: string[];
  references: Reference[];
}

export interface PostFormData {
  category_id: string;
  date: string;
  author: string;
  thumbnail_url: string;
  thumbnail_file?: File | null;
  main_image_url?: string;
  main_image_file?: File | null;
  is_published: boolean;
  translations: {
    ca: PostTranslation;
    en: PostTranslation;
  };
}

export interface StoredPost {
  id: string;
  user_id: string;
  category_id: string;
  thumbnail_url: string;
  thumbnail_id: string | null;
  image_id: string | null;
  is_published: boolean;
  date: string;
  author: string;
  created_at: string;
  updated_at: string;
  translations: {
    ca: PostTranslation & { post_id: string };
    en: PostTranslation & { post_id: string };
  };
}
