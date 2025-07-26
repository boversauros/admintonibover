import { useState, useEffect } from "react";
import { Post, ImageData } from "../../../types";

const DEFAULT_POST: Omit<Post, "id" | "user_id"> = {
  title: "",
  category_id: 0, // You'll need to set a valid category_id
  content: "",
  language: "ca",
  image_id: null,
  thumbnail_id: null,
  keywords: [],
  references: { images: [], texts: [] },
  is_published: false,
  created_at: new Date(),
  updated_at: new Date(),
  date: new Date(),
  author: "",
  slug: "",
  tags: [],
};

export const usePostEditor = (initialPost?: Partial<Post>, userId?: string) => {
  const [post, setPost] = useState<Post>(() => {
    const now = new Date();

    // For new posts, we'll use a temporary negative ID until saved
    const id = initialPost?.id || -1;

    // Create a base post with default values
    const basePost: Post = {
      ...DEFAULT_POST,
      id,
      user_id: userId || initialPost?.user_id || "", // You'll need to provide this
      updated_at: now,
      created_at: initialPost?.created_at || now,
      date: initialPost?.date || now,
      ...initialPost,
      // Ensure references is always an object with the correct shape
      references: {
        images: [],
        texts: [],
        ...initialPost?.references,
      },
      // Ensure arrays are always arrays
      keywords: initialPost?.keywords || [],
      tags: initialPost?.tags || [],
    };

    return basePost;
  });

  const [loading, setLoading] = useState<boolean>(false);

  // Load post if postId is provided
  useEffect(() => {
    if (initialPost?.id && initialPost.id > 0) {
      setLoading(true);
      // In a real app, you would fetch the post from Supabase here
      if (initialPost) {
        setPost((prev) => ({
          ...prev,
          ...initialPost,
          // Ensure references is always an object with the correct shape
          references: {
            images: [],
            texts: [],
            ...initialPost.references,
          },
          // Ensure arrays are always arrays
          keywords: initialPost.keywords || [],
          tags: initialPost.tags || [],
        }));
      }
      setLoading(false);
    }
  }, [initialPost?.id]);

  const updateField = <K extends keyof Post>(field: K, value: Post[K]) => {
    setPost(
      (prev) =>
        ({
          ...prev,
          [field]: value,
          updated_at: new Date(),
        } as Post)
    );
  };

  const updateImage = (image: ImageData | null) => {
    setPost((prev) => ({
      ...prev,
      image,
      image_id: image?.id || null,
      updated_at: new Date(),
    }));
  };

  const updateThumbnail = (thumbnail: ImageData | null) => {
    setPost((prev) => ({
      ...prev,
      thumbnail,
      thumbnail_id: thumbnail?.id || null,
      updated_at: new Date(),
    }));
  };

  const addKeyword = (keyword: string) => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;

    setPost((prev) => {
      // Check if the keyword already exists (case-insensitive)
      const keywordExists = prev.keywords.some(
        (k) => k.toLowerCase() === trimmedKeyword.toLowerCase()
      );

      if (keywordExists) return prev;

      return {
        ...prev,
        keywords: [...prev.keywords, trimmedKeyword],
        updated_at: new Date(),
      };
    });
  };

  const removeKeyword = (keyword: string) => {
    setPost((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
      updated_at: new Date(),
    }));
  };

  const addReference = (type: "images" | "texts", value: string) => {
    if (!value.trim()) return;
    setPost((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [type]: [...new Set([...prev.references[type], value])],
      },
      updated_at: new Date(),
    }));
  };

  const removeReference = (type: "images" | "texts", value: string) => {
    setPost((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [type]: prev.references[type].filter((item) => item !== value),
      },
      updated_at: new Date(),
    }));
  };

  const updateReferences = (type: "images" | "texts", references: string[]) => {
    setPost((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [type]: references,
      },
      updated_at: new Date(),
    }));
  };

  // Prepare the post data for Supabase
  const getPostForSupabase = (): Omit<Post, "image" | "thumbnail" | "id"> & {
    id?: number;
  } => {
    const { image, thumbnail, id, ...postData } = post;

    // Don't include id if it's a new post (negative id)
    const supabasePost = {
      ...postData,
      image_id: image?.id || null,
      thumbnail_id: thumbnail?.id || null,
      // Ensure dates are properly formatted for Supabase
      created_at: post.created_at,
      updated_at: post.updated_at,
      date: post.date,
    };

    // Only include id if it's an existing post
    if (id > 0) {
      return { ...supabasePost, id };
    }

    return supabasePost;
  };

  return {
    post,
    loading,
    updateField,
    updateImage,
    updateThumbnail,
    addKeyword,
    removeKeyword,
    addReference,
    removeReference,
    updateReferences,
    getPostForSupabase,
  };
};
