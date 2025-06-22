export interface Post {
  id: string;
  title: string;
  category: Category["id"];
  content: string;
  date: string;
  image: ImageData | null;
  portraitImage: ImageData;
  keywords: string[];
  references: PostReferences;
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  author?: string;
  slug?: string;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
}

export interface ImageData {
  url: string;
  title: string;
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
