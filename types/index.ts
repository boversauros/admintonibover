export type Language = "ca" | "en";

export interface Post {
  id: string;
  title: string;
  category: Category["id"];
  content: string;
  language: Language;
  image_id: string | null;
  thumbnail_id: string;
  keywords: string[];
  references: PostReferences;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  author?: string;
  slug?: string;
  tags?: string[];
  // These are populated by the API
  image?: ImageData | null;
  thumbnail?: ImageData | null;
}

export interface Category {
  id: string;
  name: string;
}

export interface ImageData {
  id: string;
  url: string;
  title: string;
  alt?: string;
  file?: File; // For uploads
}

export interface PostReferences {
  images: string[];
  texts: string[];
}

export interface PostEditorProps {
  postId?: string;
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
