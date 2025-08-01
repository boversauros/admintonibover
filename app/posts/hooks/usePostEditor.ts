import { useState, useEffect } from "react";
import { Post, ImageData } from "../../../types";
import { DEMO_USER } from "../../../data";

const DEFAULT_POST: Omit<Post, "id" | "created_at" | "updated_at"> = {
  title: "",
  category_id: 1, // Default to first category
  content: "<p>Comença a escriure el teu contingut aquí...</p>",
  language: "ca",
  image_id: null,
  thumbnail_id: null,
  keywords: [],
  references: { images: [], texts: [] },
  is_published: false,
  date: new Date(),
  user_id: DEMO_USER.id,
  author: DEMO_USER.email.split("@")[0], // Extract name from email
  slug: "",
  tags: [],
};

export const usePostEditor = (initialPost?: Partial<Post>) => {
  const [post, setPost] = useState<Post>(() => {
    const now = new Date();
    const id = initialPost?.id || -1; // -1 for new posts

    const basePost: Post = {
      ...DEFAULT_POST,
      id,
      created_at: initialPost?.created_at || now,
      updated_at: initialPost?.updated_at || now,
      ...initialPost,
      // Ensure nested objects are properly initialized
      references: {
        images: [],
        texts: [],
        ...initialPost?.references,
      },
      keywords: initialPost?.keywords || [],
      tags: initialPost?.tags || [],
    };

    return basePost;
  });

  const [loading, setLoading] = useState<boolean>(false);

  // Load post data if editing existing post
  useEffect(() => {
    if (initialPost?.id && initialPost.id > 0) {
      setLoading(true);
      // In a real app, you would fetch from API here
      setPost((prev) => ({
        ...prev,
        ...initialPost,
        references: {
          images: [],
          texts: [],
          ...initialPost.references,
        },
        keywords: initialPost.keywords || [],
        tags: initialPost.tags || [],
      }));
      setLoading(false);
    }
  }, [initialPost?.id]);

  const updateField = <K extends keyof Post>(field: K, value: Post[K]) => {
    setPost((prev) => ({
      ...prev,
      [field]: value,
      updated_at: new Date(),
    }));
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
      // Check if keyword already exists (case-insensitive)
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
        [type]: [...new Set([...prev.references[type], value])], // Avoid duplicates
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

  // Prepare post data for saving (remove client-side only fields)
  const getPostForSave = (): Omit<Post, "image" | "thumbnail" | "id"> & {
    id?: number;
  } => {
    const { image, thumbnail, id, ...postData } = post;

    const saveData = {
      ...postData,
      image_id: image?.id || null,
      thumbnail_id: thumbnail?.id || null,
    };

    // Include id only if editing existing post
    if (id > 0) {
      return { ...saveData, id };
    }

    return saveData;
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
    getPostForSave,
  };
};
