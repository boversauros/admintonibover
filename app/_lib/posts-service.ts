import { Post, ApiResponse } from "./types";
import { DEMO_POSTS, DEMO_IMAGES } from "./mock-data";

class PostsService {
  private posts: Post[] = [...DEMO_POSTS];
  private nextId: number = Math.max(...DEMO_POSTS.map((p) => p.id)) + 1;

  // Simulate async database operations
  private delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  async getAll(): Promise<ApiResponse<Post[]>> {
    await this.delay(300); // Simulate network delay
    try {
      // Populate image references
      const postsWithImages = this.posts.map((post) => ({
        ...post,
        image: post.image_id
          ? DEMO_IMAGES.find((img) => img.id === post.image_id)
          : null,
        thumbnail: post.thumbnail_id
          ? DEMO_IMAGES.find((img) => img.id === post.thumbnail_id)
          : null,
      }));
      return { data: postsWithImages };
    } catch (error) {
      return { error: "Failed to fetch posts" };
    }
  }

  async getById(id: number): Promise<ApiResponse<Post>> {
    await this.delay(200);
    try {
      const post = this.posts.find((p) => p.id === id);
      if (!post) {
        return { error: "Post not found" };
      }

      // Populate image references
      const postWithImages = {
        ...post,
        image: post.image_id
          ? DEMO_IMAGES.find((img) => img.id === post.image_id)
          : null,
        thumbnail: post.thumbnail_id
          ? DEMO_IMAGES.find((img) => img.id === post.thumbnail_id)
          : null,
      };

      return { data: postWithImages };
    } catch (error) {
      return { error: "Failed to fetch post" };
    }
  }

  async create(
    post: Omit<Post, "id" | "created_at" | "updated_at">
  ): Promise<ApiResponse<Post>> {
    await this.delay(500);
    try {
      const now = new Date();
      const newPost: Post = {
        ...post,
        id: this.nextId++,
        created_at: now,
        updated_at: now,
        slug: this.generateSlug(post.title),
      };

      this.posts.push(newPost);

      // Populate image references
      const postWithImages = {
        ...newPost,
        image: newPost.image_id
          ? DEMO_IMAGES.find((img) => img.id === newPost.image_id)
          : null,
        thumbnail: newPost.thumbnail_id
          ? DEMO_IMAGES.find((img) => img.id === newPost.thumbnail_id)
          : null,
      };

      return { data: postWithImages };
    } catch (error) {
      return { error: "Failed to create post" };
    }
  }

  async update(id: number, updates: Partial<Post>): Promise<ApiResponse<Post>> {
    await this.delay(400);
    try {
      const index = this.posts.findIndex((p) => p.id === id);
      if (index === -1) {
        return { error: "Post not found" };
      }

      const updatedPost = {
        ...this.posts[index],
        ...updates,
        updated_at: new Date(),
        slug: updates.title
          ? this.generateSlug(updates.title)
          : this.posts[index].slug,
      };

      this.posts[index] = updatedPost;

      // Populate image references
      const postWithImages = {
        ...updatedPost,
        image: updatedPost.image_id
          ? DEMO_IMAGES.find((img) => img.id === updatedPost.image_id)
          : null,
        thumbnail: updatedPost.thumbnail_id
          ? DEMO_IMAGES.find((img) => img.id === updatedPost.thumbnail_id)
          : null,
      };

      return { data: postWithImages };
    } catch (error) {
      return { error: "Failed to update post" };
    }
  }

  async delete(id: number): Promise<ApiResponse<void>> {
    await this.delay(300);
    try {
      const index = this.posts.findIndex((p) => p.id === id);
      if (index === -1) {
        return { error: "Post not found" };
      }

      this.posts.splice(index, 1);
      return { data: undefined };
    } catch (error) {
      return { error: "Failed to delete post" };
    }
  }

  async togglePublish(id: number): Promise<ApiResponse<Post>> {
    const post = this.posts.find((p) => p.id === id);
    if (!post) {
      return { error: "Post not found" };
    }

    return this.update(id, { is_published: !post.is_published });
  }

  // Helper method to generate slugs
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
      .substring(0, 60); // Limit length
  }
}

export const postsService = new PostsService();
