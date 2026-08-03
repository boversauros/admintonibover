import type { Post, PostLanguage, PostListItem } from './types';

export type ListPostsOptions = {
  limit: number;
  cursor?: string;
  direction?: 'ascending' | 'descending';
  title?: string;
  published?: boolean;
  categoryId?: string;
};

export type PostListPage = {
  items: PostListItem[];
  nextCursor: string | null;
};

export type DeletePostResult = {
  postId: string;
  imageKeys: string[];
};

export interface PostRepository {
  create(post: Post): Promise<Post>;
  getById(id: string): Promise<Post | null>;
  getBySlug(language: PostLanguage, slug: string): Promise<Post | null>;
  list(options: ListPostsOptions): Promise<PostListPage>;
  update(post: Post, expectedVersion: number): Promise<Post>;
  delete(id: string, expectedVersion: number): Promise<DeletePostResult>;
}
