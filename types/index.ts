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
  file?: File;
  created_at?: Date;
  updated_at?: Date;
}

export interface PostReferences {
  images: string[];
  texts: string[];
}

export interface PostEditorProps {
  postId?: number;
}

export interface EditableFieldProps {
  value: string;
  fieldName: string;
  isMultiline?: boolean;
  isArray?: boolean;
  index?: number | null;
  arrayPath?: string | null;
  className?: string;
}

export interface EditableArrayFieldProps {
  items: string[] | ImageData[];
  arrayPath: string;
  itemLabel: string;
  defaultValue?: string;
  isImageArray?: boolean;
}
