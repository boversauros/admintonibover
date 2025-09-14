import {
  PostV2,
  PostTranslationV2,
  PostFormDataV2,
  ApiResponseV2,
  PostDetailResponseV2,
  PostListItemV2,
  PostsServiceV2Interface,
  KeywordV2,
} from "./types-v2";
import {
  DEMO_POSTS_V2,
  DEMO_POST_TRANSLATIONS_V2,
  DEMO_IMAGES_V2,
  KEYWORDS_V2,
  getPostListItems,
} from "./mock-data-v2";
import { Language } from "./types";

class PostsServiceV2 implements PostsServiceV2Interface {
  private posts: PostV2[] = [...DEMO_POSTS_V2];
  private translations: PostTranslationV2[] = [...DEMO_POST_TRANSLATIONS_V2];
  private keywords: KeywordV2[] = [...KEYWORDS_V2];

  private nextPostId: number = Math.max(...DEMO_POSTS_V2.map((p) => p.id)) + 1;
  private nextTranslationId: number =
    Math.max(...DEMO_POST_TRANSLATIONS_V2.map((t) => t.id)) + 1;
  private nextKeywordId: number = Math.max(...KEYWORDS_V2.map((k) => k.id)) + 1;

  // Simulate async database operations
  private delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  async getAll(): Promise<ApiResponseV2<PostListItemV2[]>> {
    await this.delay(300);
    try {
      const items = this.posts.map((post) => {
        const postTranslations = this.translations.filter(
          (t) => t.post_id === post.id
        );
        const defaultTranslation =
          postTranslations.find((t) => t.language === "ca") ||
          postTranslations[0];

        return {
          id: post.id,
          category_id: post.category_id,
          is_published: post.is_published,
          date: post.date,
          created_at: post.created_at,
          updated_at: post.updated_at,
          image: DEMO_IMAGES_V2.find((img) => img.id === post.image_id),
          thumbnail: DEMO_IMAGES_V2.find((img) => img.id === post.thumbnail_id),
          default_translation: defaultTranslation
            ? {
                title: defaultTranslation.title,
                slug: defaultTranslation.slug,
                language: defaultTranslation.language,
              }
            : undefined,
          translation_count: postTranslations.length,
        };
      });

      return { data: items };
    } catch (error) {
      return { error: "Failed to fetch posts" };
    }
  }

  async getById(id: number): Promise<ApiResponseV2<PostDetailResponseV2>> {
    await this.delay(200);
    try {
      const post = this.posts.find((p) => p.id === id);
      if (!post) {
        return { error: "Post not found" };
      }

      const postTranslations = this.translations.filter(
        (t) => t.post_id === id
      );

      // Populate keywords for each translation
      const translationsWithKeywords = postTranslations.map((translation) => ({
        ...translation,
        keywords: this.getKeywordsForTranslation(translation),
      }));

      // Populate image references
      const postWithImages = {
        ...post,
        image: post.image_id
          ? DEMO_IMAGES_V2.find((img) => img.id === post.image_id)
          : null,
        thumbnail: post.thumbnail_id
          ? DEMO_IMAGES_V2.find((img) => img.id === post.thumbnail_id)
          : null,
      };

      return {
        data: {
          post: postWithImages,
          translations: translationsWithKeywords,
        },
      };
    } catch (error) {
      return { error: "Failed to fetch post" };
    }
  }

  async create(
    data: PostFormDataV2
  ): Promise<ApiResponseV2<PostDetailResponseV2>> {
    await this.delay(500);
    try {
      const now = new Date();

      // Create the core post
      const newPost: PostV2 = {
        id: this.nextPostId++,
        user_id: "550e8400-e29b-41d4-a716-446655440000", // Default user
        category_id: data.category_id,
        image_id: data.image_id,
        thumbnail_id: data.thumbnail_id,
        is_published: data.is_published,
        date: data.date,
        created_at: now,
        updated_at: now,
      };

      this.posts.push(newPost);

      // Create translations
      const newTranslations: PostTranslationV2[] = [];

      for (const [lang, translationData] of Object.entries(data.translations)) {
        if (translationData) {
          const translation: PostTranslationV2 = {
            id: this.nextTranslationId++,
            post_id: newPost.id,
            language: lang as Language,
            title: translationData.title,
            content: translationData.content,
            slug:
              translationData.slug ||
              this.generateSlug(translationData.title, lang as Language),
            references_images: translationData.references_images,
            references_texts: translationData.references_texts,
            created_at: now,
            updated_at: now,
          };

          this.translations.push(translation);
          newTranslations.push(translation);

          // Handle keywords
          await this.updateKeywordsForTranslation(
            translation.id,
            translationData.keywords,
            lang as Language
          );
        }
      }

      return this.getById(newPost.id);
    } catch (error) {
      return { error: "Failed to create post" };
    }
  }

  async update(
    id: number,
    data: Partial<PostFormDataV2>
  ): Promise<ApiResponseV2<PostDetailResponseV2>> {
    await this.delay(400);
    try {
      const postIndex = this.posts.findIndex((p) => p.id === id);
      if (postIndex === -1) {
        return { error: "Post not found" };
      }

      const now = new Date();

      // Update core post fields
      if (
        data.category_id !== undefined ||
        data.image_id !== undefined ||
        data.thumbnail_id !== undefined ||
        data.is_published !== undefined ||
        data.date !== undefined
      ) {
        this.posts[postIndex] = {
          ...this.posts[postIndex],
          ...(data.category_id !== undefined && {
            category_id: data.category_id,
          }),
          ...(data.image_id !== undefined && { image_id: data.image_id }),
          ...(data.thumbnail_id !== undefined && {
            thumbnail_id: data.thumbnail_id,
          }),
          ...(data.is_published !== undefined && {
            is_published: data.is_published,
          }),
          ...(data.date !== undefined && { date: data.date }),
          updated_at: now,
        };
      }

      // Update translations if provided
      if (data.translations) {
        for (const [lang, translationData] of Object.entries(
          data.translations
        )) {
          if (translationData) {
            const existingTranslationIndex = this.translations.findIndex(
              (t) => t.post_id === id && t.language === lang
            );

            if (existingTranslationIndex !== -1) {
              // Update existing translation
              this.translations[existingTranslationIndex] = {
                ...this.translations[existingTranslationIndex],
                title: translationData.title,
                content: translationData.content,
                slug:
                  translationData.slug ||
                  this.generateSlug(translationData.title, lang as Language),
                references_images: translationData.references_images,
                references_texts: translationData.references_texts,
                updated_at: now,
              };

              // Update keywords
              await this.updateKeywordsForTranslation(
                this.translations[existingTranslationIndex].id,
                translationData.keywords,
                lang as Language
              );
            } else {
              // Create new translation
              const newTranslation: PostTranslationV2 = {
                id: this.nextTranslationId++,
                post_id: id,
                language: lang as Language,
                title: translationData.title,
                content: translationData.content,
                slug:
                  translationData.slug ||
                  this.generateSlug(translationData.title, lang as Language),
                references_images: translationData.references_images,
                references_texts: translationData.references_texts,
                created_at: now,
                updated_at: now,
              };

              this.translations.push(newTranslation);

              // Handle keywords
              await this.updateKeywordsForTranslation(
                newTranslation.id,
                translationData.keywords,
                lang as Language
              );
            }
          }
        }
      }

      return this.getById(id);
    } catch (error) {
      return { error: "Failed to update post" };
    }
  }

  async delete(id: number): Promise<ApiResponseV2<void>> {
    await this.delay(300);
    try {
      const index = this.posts.findIndex((p) => p.id === id);
      if (index === -1) {
        return { error: "Post not found" };
      }

      // Delete post
      this.posts.splice(index, 1);

      // Delete all translations for this post
      this.translations = this.translations.filter((t) => t.post_id !== id);

      return { data: undefined };
    } catch (error) {
      return { error: "Failed to delete post" };
    }
  }

  async getTranslation(
    postId: number,
    language: Language
  ): Promise<ApiResponseV2<PostTranslationV2>> {
    await this.delay(100);
    try {
      const translation = this.translations.find(
        (t) => t.post_id === postId && t.language === language
      );

      if (!translation) {
        return { error: "Translation not found" };
      }

      // Add keywords
      const translationWithKeywords = {
        ...translation,
        keywords: this.getKeywordsForTranslation(translation),
      };

      return { data: translationWithKeywords };
    } catch (error) {
      return { error: "Failed to fetch translation" };
    }
  }

  async createTranslation(
    postId: number,
    language: Language,
    data: Omit<
      PostTranslationV2,
      "id" | "post_id" | "language" | "created_at" | "updated_at"
    >
  ): Promise<ApiResponseV2<PostTranslationV2>> {
    await this.delay(300);
    try {
      const post = this.posts.find((p) => p.id === postId);
      if (!post) {
        return { error: "Post not found" };
      }

      // Check if translation already exists
      const existing = this.translations.find(
        (t) => t.post_id === postId && t.language === language
      );
      if (existing) {
        return { error: "Translation already exists for this language" };
      }

      const now = new Date();
      const newTranslation: PostTranslationV2 = {
        id: this.nextTranslationId++,
        post_id: postId,
        language,
        title: data.title,
        content: data.content,
        slug: data.slug || this.generateSlug(data.title, language),
        references_images: data.references_images || [],
        references_texts: data.references_texts || [],
        created_at: now,
        updated_at: now,
      };

      this.translations.push(newTranslation);

      // Handle keywords if provided
      if (data.keywords) {
        await this.updateKeywordsForTranslation(
          newTranslation.id,
          data.keywords.map((k) => k.keyword),
          language
        );
      }

      return { data: newTranslation };
    } catch (error) {
      return { error: "Failed to create translation" };
    }
  }

  async updateTranslation(
    translationId: number,
    data: Partial<PostTranslationV2>
  ): Promise<ApiResponseV2<PostTranslationV2>> {
    await this.delay(200);
    try {
      const index = this.translations.findIndex((t) => t.id === translationId);
      if (index === -1) {
        return { error: "Translation not found" };
      }

      this.translations[index] = {
        ...this.translations[index],
        ...data,
        updated_at: new Date(),
      };

      return { data: this.translations[index] };
    } catch (error) {
      return { error: "Failed to update translation" };
    }
  }

  async deleteTranslation(translationId: number): Promise<ApiResponseV2<void>> {
    await this.delay(200);
    try {
      const index = this.translations.findIndex((t) => t.id === translationId);
      if (index === -1) {
        return { error: "Translation not found" };
      }

      this.translations.splice(index, 1);
      return { data: undefined };
    } catch (error) {
      return { error: "Failed to delete translation" };
    }
  }

  async togglePublish(id: number): Promise<ApiResponseV2<PostV2>> {
    await this.delay(200);
    try {
      const post = this.posts.find((p) => p.id === id);
      if (!post) {
        return { error: "Post not found" };
      }

      post.is_published = !post.is_published;
      post.updated_at = new Date();

      return { data: post };
    } catch (error) {
      return { error: "Failed to toggle publish status" };
    }
  }

  generateSlug(title: string, language: Language): string {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
      .substring(0, 60); // Limit length
  }

  // Helper methods
  private getKeywordsForTranslation(
    translation: PostTranslationV2
  ): KeywordV2[] {
    // In a real implementation, this would query the junction table
    // For now, return mock keywords based on the translation
    if (translation.id === 1) {
      return [
        KEYWORDS_V2.find(
          (k) => k.keyword === "disseny" && k.language === "ca"
        )!,
        KEYWORDS_V2.find(
          (k) => k.keyword === "minimalisme" && k.language === "ca"
        )!,
        KEYWORDS_V2.find((k) => k.keyword === "web" && k.language === "ca")!,
      ].filter(Boolean);
    }
    if (translation.id === 2) {
      return [
        KEYWORDS_V2.find((k) => k.keyword === "design" && k.language === "en")!,
        KEYWORDS_V2.find(
          (k) => k.keyword === "minimalism" && k.language === "en"
        )!,
        KEYWORDS_V2.find((k) => k.keyword === "web" && k.language === "en")!,
      ].filter(Boolean);
    }
    return [];
  }

  private async updateKeywordsForTranslation(
    translationId: number,
    keywords: string[],
    language: Language
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Delete existing keyword associations
    // 2. Create or find keywords
    // 3. Create new associations

    for (const keyword of keywords) {
      const existing = this.keywords.find(
        (k) =>
          k.keyword.toLowerCase() === keyword.toLowerCase() &&
          k.language === language
      );

      if (!existing) {
        this.keywords.push({
          id: this.nextKeywordId++,
          keyword,
          language,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  }
}

export const postsServiceV2 = new PostsServiceV2();
