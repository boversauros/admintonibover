import { useState, useEffect, useCallback } from "react";
import {
  PostWithTranslationsV2,
  PostFormDataV2,
  ImageDataV2,
  PostDetailResponseV2,
  KeywordV2,
} from "../_lib/types-v2";
import { Language } from "../_lib/types";
import { DEMO_USER_V2 } from "../_lib/mock-data-v2";
import { postsServiceV2 } from "../_lib/posts-service-v2";

interface UsePostEditorV2Options {
  postId?: number;
  defaultLanguage?: Language;
}

interface UsePostEditorV2Return {
  // Core post data
  post: PostWithTranslationsV2;
  loading: boolean;
  saving: boolean;
  error: string | null;

  // Language management
  activeLanguage: Language;
  setActiveLanguage: (lang: Language) => void;
  availableLanguages: Language[];
  hasTranslation: (lang: Language) => boolean;

  // Field updates - Core post fields
  updateCoreField: <
    K extends keyof Pick<
      PostWithTranslationsV2,
      "category_id" | "is_published" | "date"
    >
  >(
    field: K,
    value: PostWithTranslationsV2[K]
  ) => void;
  updateImage: (image: ImageDataV2 | null) => void;
  updateThumbnail: (thumbnail: ImageDataV2 | null) => void;

  // Field updates - Translation specific
  updateTranslationField: (
    field: "title" | "content" | "slug",
    value: string,
    language?: Language
  ) => void;

  // Keywords management
  addKeyword: (keyword: string, language?: Language) => void;
  removeKeyword: (keyword: string, language?: Language) => void;
  getKeywords: (language?: Language) => string[];

  // References management
  addReference: (
    type: "images" | "texts",
    value: string,
    language?: Language
  ) => void;
  removeReference: (
    type: "images" | "texts",
    value: string,
    language?: Language
  ) => void;
  getReferences: (language?: Language) => { images: string[]; texts: string[] };

  // Translation management
  createTranslation: (language: Language) => void;
  deleteTranslation: (language: Language) => void;

  // Save functionality
  save: () => Promise<void>;
  getFormData: () => PostFormDataV2;
}

const createEmptyPost = (): PostWithTranslationsV2 => ({
  id: -1,
  user_id: DEMO_USER_V2.id,
  category_id: 1,
  image_id: null,
  thumbnail_id: null,
  is_published: false,
  date: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  translations: {},
  activeLanguage: "ca",
});

const createEmptyTranslation = () => ({
  title: "",
  content: "<p>Comença a escriure el teu contingut aquí...</p>",
  slug: "",
  keywords: [] as KeywordV2[],
  references_images: [] as string[],
  references_texts: [] as string[],
});

export const usePostEditorV2 = ({
  postId,
  defaultLanguage = "ca",
}: UsePostEditorV2Options = {}): UsePostEditorV2Return => {
  const [post, setPost] = useState<PostWithTranslationsV2>(() => {
    const newPost = createEmptyPost();
    newPost.activeLanguage = defaultLanguage;
    // Initialize with empty Catalan translation by default
    newPost.translations.ca = {
      id: -1,
      post_id: -1,
      language: "ca",
      ...createEmptyTranslation(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    return newPost;
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] =
    useState<Language>(defaultLanguage);

  // Load existing post if editing
  useEffect(() => {
    if (postId && postId > 0) {
      loadPost(postId);
    }
  }, [postId]);

  const loadPost = async (id: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await postsServiceV2.getById(id);

      if (response.error || !response.data) {
        setError(response.error || "Post not found");
        return;
      }

      const { post: corePost, translations } = response.data;

      // Convert to PostWithTranslationsV2 format
      const postWithTranslations: PostWithTranslationsV2 = {
        ...corePost,
        translations: {},
        activeLanguage,
      };

      // Map translations by language
      translations.forEach((translation) => {
        postWithTranslations.translations[translation.language] = translation;
      });

      setPost(postWithTranslations);
    } catch (err) {
      setError("Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  // Core field updates
  const updateCoreField = useCallback(
    <
      K extends keyof Pick<
        PostWithTranslationsV2,
        "category_id" | "is_published" | "date"
      >
    >(
      field: K,
      value: PostWithTranslationsV2[K]
    ) => {
      setPost((prev) => ({
        ...prev,
        [field]: value,
        updated_at: new Date(),
      }));
    },
    []
  );

  const updateImage = useCallback((image: ImageDataV2 | null) => {
    setPost((prev) => ({
      ...prev,
      image,
      image_id: image?.id || null,
      updated_at: new Date(),
    }));
  }, []);

  const updateThumbnail = useCallback((thumbnail: ImageDataV2 | null) => {
    setPost((prev) => ({
      ...prev,
      thumbnail,
      thumbnail_id: thumbnail?.id || null,
      updated_at: new Date(),
    }));
  }, []);

  // Translation field updates
  const updateTranslationField = useCallback(
    (
      field: "title" | "content" | "slug",
      value: string,
      language: Language = activeLanguage
    ) => {
      setPost((prev) => {
        const translation = prev.translations[language] || {
          id: -1,
          post_id: prev.id,
          language,
          ...createEmptyTranslation(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        return {
          ...prev,
          translations: {
            ...prev.translations,
            [language]: {
              ...translation,
              [field]: value,
              updated_at: new Date(),
            },
          },
          updated_at: new Date(),
        };
      });
    },
    [activeLanguage]
  );

  // Keywords management
  const addKeyword = useCallback(
    (keyword: string, language: Language = activeLanguage) => {
      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) return;

      setPost((prev) => {
        const translation = prev.translations[language];
        if (!translation) return prev;

        const currentKeywords =
          translation.keywords?.map((k) =>
            typeof k === "string" ? k : k.keyword
          ) || [];

        if (
          currentKeywords.some(
            (k) => k.toLowerCase() === trimmedKeyword.toLowerCase()
          )
        ) {
          return prev;
        }

        return {
          ...prev,
          translations: {
            ...prev.translations,
            [language]: {
              ...translation,
              keywords: [...currentKeywords, trimmedKeyword] as any,
              updated_at: new Date(),
            },
          },
          updated_at: new Date(),
        };
      });
    },
    [activeLanguage]
  );

  const removeKeyword = useCallback(
    (keyword: string, language: Language = activeLanguage) => {
      setPost((prev) => {
        const translation = prev.translations[language];
        if (!translation) return prev;

        const currentKeywords =
          translation.keywords?.map((k) =>
            typeof k === "string" ? k : k.keyword
          ) || [];

        return {
          ...prev,
          translations: {
            ...prev.translations,
            [language]: {
              ...translation,
              keywords: currentKeywords.filter((k) => k !== keyword) as any,
              updated_at: new Date(),
            },
          },
          updated_at: new Date(),
        };
      });
    },
    [activeLanguage]
  );

  const getKeywords = useCallback(
    (language: Language = activeLanguage): string[] => {
      const translation = post.translations[language];
      if (!translation) return [];

      return (translation.keywords || []).map((k) =>
        typeof k === "string" ? k : k.keyword
      );
    },
    [post, activeLanguage]
  );

  // References management
  const addReference = useCallback(
    (
      type: "images" | "texts",
      value: string,
      language: Language = activeLanguage
    ) => {
      if (!value.trim()) return;

      setPost((prev) => {
        const translation = prev.translations[language];
        if (!translation) return prev;

        const refField =
          type === "images" ? "references_images" : "references_texts";
        const currentRefs = translation[refField] || [];

        if (currentRefs.includes(value)) return prev;

        return {
          ...prev,
          translations: {
            ...prev.translations,
            [language]: {
              ...translation,
              [refField]: [...currentRefs, value],
              updated_at: new Date(),
            },
          },
          updated_at: new Date(),
        };
      });
    },
    [activeLanguage]
  );

  const removeReference = useCallback(
    (
      type: "images" | "texts",
      value: string,
      language: Language = activeLanguage
    ) => {
      setPost((prev) => {
        const translation = prev.translations[language];
        if (!translation) return prev;

        const refField =
          type === "images" ? "references_images" : "references_texts";
        const currentRefs = translation[refField] || [];

        return {
          ...prev,
          translations: {
            ...prev.translations,
            [language]: {
              ...translation,
              [refField]: currentRefs.filter((ref) => ref !== value),
              updated_at: new Date(),
            },
          },
          updated_at: new Date(),
        };
      });
    },
    [activeLanguage]
  );

  const getReferences = useCallback(
    (language: Language = activeLanguage) => {
      const translation = post.translations[language];
      return {
        images: translation?.references_images || [],
        texts: translation?.references_texts || [],
      };
    },
    [post, activeLanguage]
  );

  // Translation management
  const createTranslation = useCallback((language: Language) => {
    setPost((prev) => {
      if (prev.translations[language]) return prev;

      return {
        ...prev,
        translations: {
          ...prev.translations,
          [language]: {
            id: -1,
            post_id: prev.id,
            language,
            ...createEmptyTranslation(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
        updated_at: new Date(),
      };
    });
  }, []);

  const deleteTranslation = useCallback((language: Language) => {
    setPost((prev) => {
      const { [language]: deleted, ...remaining } = prev.translations;
      return {
        ...prev,
        translations: remaining,
        updated_at: new Date(),
      };
    });
  }, []);

  const hasTranslation = useCallback(
    (lang: Language): boolean => {
      return !!post.translations[lang];
    },
    [post]
  );

  // Get form data for saving
  const getFormData = useCallback((): PostFormDataV2 => {
    const formData: PostFormDataV2 = {
      category_id: post.category_id,
      image_id: post.image_id,
      thumbnail_id: post.thumbnail_id,
      is_published: post.is_published,
      date: post.date,
      translations: {},
    };

    // Process each translation
    Object.entries(post.translations).forEach(([lang, translation]) => {
      if (translation && translation.title) {
        const keywords = (translation.keywords || []).map((k) =>
          typeof k === "string" ? k : k.keyword
        );

        formData.translations[lang as Language] = {
          title: translation.title,
          content: translation.content,
          slug: translation.slug,
          keywords,
          references_images: translation.references_images || [],
          references_texts: translation.references_texts || [],
        };
      }
    });

    return formData;
  }, [post]);

  // Save functionality
  const save = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const formData = getFormData();

      if (post.id > 0) {
        // Update existing post
        const response = await postsServiceV2.update(post.id, formData);
        if (response.error) {
          throw new Error(response.error);
        }
      } else {
        // Create new post
        const response = await postsServiceV2.create(formData);
        if (response.error) {
          throw new Error(response.error);
        }

        // Update local state with new ID
        if (response.data) {
          const { post: newPost, translations } = response.data;
          setPost((prev) => ({
            ...prev,
            id: newPost.id,
            created_at: newPost.created_at,
            updated_at: newPost.updated_at,
          }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [post.id, getFormData]);

  return {
    post,
    loading,
    saving,
    error,
    activeLanguage,
    setActiveLanguage,
    availableLanguages: ["ca", "en"],
    hasTranslation,
    updateCoreField,
    updateImage,
    updateThumbnail,
    updateTranslationField,
    addKeyword,
    removeKeyword,
    getKeywords,
    addReference,
    removeReference,
    getReferences,
    createTranslation,
    deleteTranslation,
    save,
    getFormData,
  };
};
