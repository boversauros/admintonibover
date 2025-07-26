import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Post, ImageData } from "../../../types";

const DEFAULT_POST: Omit<Post, "id"> = {
  title: "",
  category: "",
  content: "",
  language: "ca",
  image_id: null,
  thumbnail_id: "",
  keywords: [],
  references: { images: [], texts: [] },
  isPublished: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: "",
  slug: "",
  tags: [],
};

export const usePostEditor = (initialPost?: Partial<Post>) => {
  const [post, setPost] = useState<Post>(() => {
    const now = new Date();
    const id = initialPost?.id || uuidv4();

    // Create a base post with default values
    const basePost: Post = {
      ...DEFAULT_POST,
      id,
      updatedAt: now,
      createdAt: initialPost?.createdAt || now,
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
    if (initialPost?.id) {
      setLoading(true);
      // In a real app, you would fetch the post from an API here
      // For now, we'll just use the initialPost if provided
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
          updatedAt: new Date(),
        } as Post)
    );
  };

  const updateImage = (image: ImageData | null) => {
    setPost((prev) => ({
      ...prev,
      image,
      image_id: image?.id || null,
      updatedAt: new Date(),
    }));
  };

  const updateThumbnail = (thumbnail: ImageData) => {
    setPost((prev) => ({
      ...prev,
      thumbnail,
      thumbnail_id: thumbnail.id,
      updatedAt: new Date(),
    }));
  };

  const addKeyword = (keyword: string) => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;
    
    setPost((prev) => {
      // Check if the keyword already exists (case-insensitive)
      const keywordExists = prev.keywords.some(
        k => k.toLowerCase() === trimmedKeyword.toLowerCase()
      );
      
      if (keywordExists) return prev;
      
      return {
        ...prev,
        keywords: [...prev.keywords, trimmedKeyword],
        updatedAt: new Date(),
      };
    });
  };

  const removeKeyword = (keyword: string) => {
    setPost((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
      updatedAt: new Date(),
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
      updatedAt: new Date(),
    }));
  };

  const removeReference = (type: "images" | "texts", value: string) => {
    setPost((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [type]: prev.references[type].filter((item) => item !== value),
      },
      updatedAt: new Date(),
    }));
  };

  const updateReferences = (type: "images" | "texts", references: string[]) => {
    setPost((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [type]: references,
      },
      updatedAt: new Date(),
    }));
  };

  // Prepare the post data for Supabase
  const getPostForSupabase = (): Omit<Post, "image" | "thumbnail"> => {
    const { image, thumbnail, ...postData } = post;
    return {
      ...postData,
      image_id: image?.id || null,
      thumbnail_id: thumbnail?.id || "",
      // Ensure dates are properly formatted for Supabase
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    } as Post;
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
