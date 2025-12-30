import { supabase } from "../supabase";
import { StoredPost, Language, Reference, Image } from "../types/post";
import { getUserId } from "../auth/utils";

// Language ID mapping (based on seed data)
const LANGUAGE_IDS = {
  ca: 1,
  en: 2,
} as const;

/**
 * Fetches all posts from Supabase with related data
 * Transforms normalized DB structure to denormalized StoredPost format
 */
export async function getPosts(): Promise<StoredPost[]> {
  try {
    // Fetch posts with translations and images
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        `
        *,
        post_translations (
          id,
          language_id,
          title,
          content,
          slug
        ),
        thumbnail:images!posts_thumbnail_id_fkey (
          id,
          url,
          title,
          alt,
          created_at,
          updated_at
        ),
        image:images!posts_image_id_fkey (
          id,
          url,
          title,
          alt,
          created_at,
          updated_at
        )
      `
      )
      .order("created_at", { ascending: false });

    if (postsError) throw postsError;
    if (!posts || posts.length === 0) return [];

    // Fetch keywords and references for all post translations
    const translationIds = posts.flatMap(
      (p) => p.post_translations?.map((t: any) => t.id) || []
    );

    const [keywordsResult, referencesResult] = await Promise.all([
      supabase
        .from("post_keywords")
        .select("post_translation_id, keywords(keyword)")
        .in("post_translation_id", translationIds),
      supabase
        .from("post_references")
        .select("*")
        .in("post_translation_id", translationIds)
        .order("sort_order", { ascending: true }),
    ]);

    if (keywordsResult.error) throw keywordsResult.error;
    if (referencesResult.error) throw referencesResult.error;

    // Group keywords and references by translation ID
    const keywordsByTranslation = new Map<number, string[]>();
    keywordsResult.data?.forEach((pk: any) => {
      const translationId = pk.post_translation_id;
      if (!keywordsByTranslation.has(translationId)) {
        keywordsByTranslation.set(translationId, []);
      }
      keywordsByTranslation.get(translationId)!.push(pk.keywords.keyword);
    });

    const referencesByTranslation = new Map<number, Reference[]>();
    referencesResult.data?.forEach((ref: any) => {
      const translationId = ref.post_translation_id;
      if (!referencesByTranslation.has(translationId)) {
        referencesByTranslation.set(translationId, []);
      }
      referencesByTranslation.get(translationId)!.push({
        id: ref.id.toString(),
        type: ref.type,
        reference: ref.reference,
        blockquote: ref.blockquote || "",
        sort_order: ref.sort_order,
      });
    });

    // Helper to transform image data
    const transformImage = (img: any): Image | null => {
      if (!img) return null;
      return {
        id: img.id.toString(),
        url: img.url,
        title: img.title || "",
        alt: img.alt || "",
        created_at: img.created_at,
        updated_at: img.updated_at,
      };
    };

    // Transform to StoredPost format
    const storedPosts: StoredPost[] = posts.map((post: any) => {
      const translations = post.post_translations || [];
      const caTranslation = translations.find(
        (t: any) => t.language_id === LANGUAGE_IDS.ca
      );
      const enTranslation = translations.find(
        (t: any) => t.language_id === LANGUAGE_IDS.en
      );

      return {
        id: post.id.toString(),
        user_id: post.user_id,
        category_id: post.category_id.toString(),
        thumbnail_id: post.thumbnail_id ? post.thumbnail_id.toString() : null,
        thumbnail: transformImage(post.thumbnail),
        image_id: post.image_id ? post.image_id.toString() : null,
        image: transformImage(post.image),
        is_published: post.is_published,
        date: post.date,
        author: post.author,
        created_at: post.created_at,
        updated_at: post.updated_at,
        translations: {
          ca: {
            language: "ca",
            post_id: post.id.toString(),
            title: caTranslation?.title || "",
            content: caTranslation?.content || "",
            slug: caTranslation?.slug || "",
            keywords: keywordsByTranslation.get(caTranslation?.id) || [],
            references: referencesByTranslation.get(caTranslation?.id) || [],
          },
          en: {
            language: "en",
            post_id: post.id.toString(),
            title: enTranslation?.title || "",
            content: enTranslation?.content || "",
            slug: enTranslation?.slug || "",
            keywords: keywordsByTranslation.get(enTranslation?.id) || [],
            references: referencesByTranslation.get(enTranslation?.id) || [],
          },
        },
      };
    });

    return storedPosts;
  } catch (error) {
    console.error("Error fetching posts:", error);
    throw new Error("Failed to fetch posts from database");
  }
}

/**
 * Saves a single post (create or update)
 * Handles multi-table operations: posts, post_translations, keywords, references
 */
export async function savePost(post: StoredPost): Promise<void> {
  try {
    const isUpdate = post.id && !post.id.startsWith("post-"); // Check if it's a real DB ID

    if (isUpdate) {
      await updatePost(post);
    } else {
      await createPost(post);
    }
  } catch (error) {
    console.error("Error saving post:", error);
    throw error;
  }
}

/**
 * Creates a new post with translations, keywords, and references
 */
async function createPost(post: StoredPost): Promise<void> {
  const userId = await getUserId();

  if (!userId) {
    throw new Error('You must be authenticated to create posts');
  }

  // Insert post
  const { data: newPost, error: postError } = await supabase
    .from("posts")
    .insert({
      category_id: parseInt(post.category_id),
      user_id: userId,
      author: post.author,
      is_published: post.is_published,
      date: post.date,
      thumbnail_id: post.thumbnail_id ? parseInt(post.thumbnail_id) : null,
      image_id: post.image_id ? parseInt(post.image_id) : null,
    })
    .select()
    .single();

  if (postError) throw postError;

  // Insert translations
  await Promise.all([
    insertTranslation(newPost.id, "ca", post.translations.ca),
    insertTranslation(newPost.id, "en", post.translations.en),
  ]);
}

/**
 * Updates an existing post
 */
async function updatePost(post: StoredPost): Promise<void> {
  const postId = parseInt(post.id);

  // Update post
  const { error: postError } = await supabase
    .from("posts")
    .update({
      category_id: parseInt(post.category_id),
      author: post.author,
      is_published: post.is_published,
      date: post.date,
      thumbnail_id: post.thumbnail_id ? parseInt(post.thumbnail_id) : null,
      image_id: post.image_id ? parseInt(post.image_id) : null,
    })
    .eq("id", postId);

  if (postError) throw postError;

  // Update translations
  await Promise.all([
    updateTranslation(postId, "ca", post.translations.ca),
    updateTranslation(postId, "en", post.translations.en),
  ]);
}

/**
 * Inserts a translation with keywords and references
 */
async function insertTranslation(
  postId: number,
  language: Language,
  translation: StoredPost["translations"]["ca"]
): Promise<void> {
  const languageId = LANGUAGE_IDS[language];

  // Insert translation
  const { data: newTranslation, error: translationError } = await supabase
    .from("post_translations")
    .insert({
      post_id: postId,
      language_id: languageId,
      title: translation.title,
      content: translation.content,
      slug: translation.slug,
    })
    .select()
    .single();

  if (translationError) throw translationError;

  // Insert keywords and references
  await Promise.all([
    insertKeywords(newTranslation.id, languageId, translation.keywords),
    insertReferences(newTranslation.id, translation.references),
  ]);
}

/**
 * Updates a translation with keywords and references
 */
async function updateTranslation(
  postId: number,
  language: Language,
  translation: StoredPost["translations"]["ca"]
): Promise<void> {
  const languageId = LANGUAGE_IDS[language];

  // Get existing translation
  const { data: existingTranslation, error: fetchError } = await supabase
    .from("post_translations")
    .select("id")
    .eq("post_id", postId)
    .eq("language_id", languageId)
    .single();

  if (fetchError) throw fetchError;

  // Update translation
  const { error: updateError } = await supabase
    .from("post_translations")
    .update({
      title: translation.title,
      content: translation.content,
      slug: translation.slug,
    })
    .eq("id", existingTranslation.id);

  if (updateError) throw updateError;

  // Delete old keywords and references, then insert new ones
  await Promise.all([
    supabase
      .from("post_keywords")
      .delete()
      .eq("post_translation_id", existingTranslation.id),
    supabase
      .from("post_references")
      .delete()
      .eq("post_translation_id", existingTranslation.id),
  ]);

  await Promise.all([
    insertKeywords(existingTranslation.id, languageId, translation.keywords),
    insertReferences(existingTranslation.id, translation.references),
  ]);
}

/**
 * Inserts keywords for a translation
 */
async function insertKeywords(
  translationId: number,
  languageId: number,
  keywords: string[]
): Promise<void> {
  if (!keywords || keywords.length === 0) return;

  // Insert or get existing keywords
  const keywordRecords = await Promise.all(
    keywords.map(async (keyword) => {
      const { data, error } = await supabase
        .from("keywords")
        .upsert(
          { keyword, language_id: languageId },
          { onConflict: "keyword,language_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    })
  );

  // Link keywords to translation
  const { error: linkError } = await supabase.from("post_keywords").insert(
    keywordRecords.map((kw) => ({
      post_translation_id: translationId,
      keyword_id: kw.id,
    }))
  );

  if (linkError) throw linkError;
}

/**
 * Inserts references for a translation
 */
async function insertReferences(
  translationId: number,
  references: Reference[]
): Promise<void> {
  if (!references || references.length === 0) return;

  const { error } = await supabase.from("post_references").insert(
    references.map((ref, index) => ({
      post_translation_id: translationId,
      type: ref.type,
      reference: ref.reference,
      blockquote: ref.blockquote || null,
      sort_order: ref.sort_order || index,
    }))
  );

  if (error) throw error;
}

/**
 * Deletes a post and all related data (cascading)
 */
export async function deletePost(id: string): Promise<void> {
  try {
    const postId = parseInt(id);
    const { error } = await supabase.from("posts").delete().eq("id", postId);

    if (error) throw error;
  } catch (error) {
    console.error("Error deleting post:", error);
    throw new Error("Failed to delete post");
  }
}

/**
 * Gets existing slugs for a language (for uniqueness check)
 */
export async function getExistingSlugs(
  language: Language,
  excludePostId?: string
): Promise<string[]> {
  try {
    const languageId = LANGUAGE_IDS[language];
    let query = supabase
      .from("post_translations")
      .select("slug")
      .eq("language_id", languageId);

    if (excludePostId && !excludePostId.startsWith("post-")) {
      query = query.neq("post_id", parseInt(excludePostId));
    }

    const { data, error } = await query;

    if (error) throw error;
    return data?.map((t) => t.slug) || [];
  } catch (error) {
    console.error("Error fetching slugs:", error);
    return [];
  }
}

/**
 * Generates a post ID (kept for compatibility, but DB will auto-generate)
 */
export function generatePostId(): string {
  return `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * @deprecated Use savePost() and deletePost() instead
 * This function is kept for backward compatibility but is not efficient with Supabase
 */
export async function savePosts(posts: StoredPost[]): Promise<void> {
  throw new Error(
    "savePosts() is deprecated with Supabase. Use savePost() for individual operations."
  );
}
