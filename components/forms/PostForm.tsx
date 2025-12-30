"use client";

import { useState, useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { Button, Heading } from "@/components/ui";
import { PostFormData, StoredPost, Language } from "@/lib/types/post";
import { slugify, generateUniqueSlug } from "@/lib/utils/slugify";
import { savePost, getExistingSlugs } from "@/lib/api/posts";
import { uploadAndCreateImage, deleteImageCompletely } from "@/lib/api/images";
import { LanguageTabs } from "./LanguageTabs";
import { PostMetadataSection } from "./PostMetadataSection";
import { TranslationSection } from "./TranslationSection";
import { ImageSection } from "./ImageSection";
import { KeywordsSection } from "./KeywordsSection";
import { ReferencesSection } from "./ReferencesSection";

interface PostFormProps {
  initialData?: StoredPost;
  onSuccess?: () => void;
}

export function PostForm({ initialData, onSuccess }: PostFormProps) {
  const [activeLanguage, setActiveLanguage] = useState<Language>("ca");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingThumbnailId, setExistingThumbnailId] = useState<string | null>(
    initialData?.thumbnail_id || null
  );
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string>(
    initialData?.thumbnail?.url || ""
  );
  const [existingMainImageId, setExistingMainImageId] = useState<string | null>(
    initialData?.image_id || null
  );
  const [existingMainImageUrl, setExistingMainImageUrl] = useState<string>(
    initialData?.image?.url || ""
  );

  const methods = useForm<PostFormData>({
    defaultValues: initialData
      ? {
          category_id: initialData.category_id,
          date: initialData.date,
          author: initialData.author,
          thumbnail_file: null,
          main_image_file: null,
          is_published: initialData.is_published,
          translations: {
            ca: {
              language: "ca",
              title: initialData.translations.ca.title,
              content: initialData.translations.ca.content,
              slug: initialData.translations.ca.slug,
              keywords: initialData.translations.ca.keywords,
              references: initialData.translations.ca.references,
            },
            en: {
              language: "en",
              title: initialData.translations.en.title,
              content: initialData.translations.en.content,
              slug: initialData.translations.en.slug,
              keywords: initialData.translations.en.keywords,
              references: initialData.translations.en.references,
            },
          },
        }
      : {
          category_id: "",
          date: "",
          author: "",
          thumbnail_file: null,
          main_image_file: null,
          is_published: false,
          translations: {
            ca: {
              language: "ca",
              title: "",
              content: "",
              slug: "",
              keywords: [],
              references: [],
            },
            en: {
              language: "en",
              title: "",
              content: "",
              slug: "",
              keywords: [],
              references: [],
            },
          },
        },
    mode: "onChange",
  });

  const { watch, setValue, handleSubmit, reset } = methods;

  // Auto-generate slugs from titles
  const titleCA = watch("translations.ca.title");
  const titleEN = watch("translations.en.title");
  const slugCA = watch("translations.ca.slug");
  const slugEN = watch("translations.en.slug");

  useEffect(() => {
    if (titleCA) {
      const generatedSlug = slugify(titleCA);
      // Only update if slug is empty or matches the previously generated slug
      if (!slugCA || slugCA === slugify(watch("translations.ca.title"))) {
        setValue("translations.ca.slug", generatedSlug);
      }
    }
  }, [titleCA]);

  useEffect(() => {
    if (titleEN) {
      const generatedSlug = slugify(titleEN);
      if (!slugEN || slugEN === slugify(watch("translations.en.title"))) {
        setValue("translations.en.slug", generatedSlug);
      }
    }
  }, [titleEN]);

  const onSubmit = async (data: PostFormData) => {
    if (isSubmitting) return; // Prevent multiple submissions

    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const isEditMode = !!initialData;

      // 1. Handle thumbnail upload
      let thumbnailId = existingThumbnailId;
      let newThumbnailUrl = existingThumbnailUrl;

      if (data.thumbnail_file) {
        // Upload new thumbnail
        const uploadedThumbnail = await uploadAndCreateImage(
          data.thumbnail_file,
          "post-thumbnails",
          "Post Thumbnail",
          `Thumbnail for ${data.translations.ca.title || "post"}`
        );

        thumbnailId = uploadedThumbnail.id;
        newThumbnailUrl = uploadedThumbnail.url;

        // Delete old thumbnail if exists
        if (existingThumbnailId && existingThumbnailUrl) {
          await deleteImageCompletely(
            existingThumbnailId,
            existingThumbnailUrl,
            "post-thumbnails"
          );
        }
      }

      // 2. Handle main image upload
      let mainImageId = existingMainImageId;
      let newMainImageUrl = existingMainImageUrl;

      if (data.main_image_file) {
        // Upload new main image
        const uploadedMainImage = await uploadAndCreateImage(
          data.main_image_file,
          "post-images",
          "Post Main Image",
          `Main image for ${data.translations.ca.title || "post"}`
        );

        mainImageId = uploadedMainImage.id;
        newMainImageUrl = uploadedMainImage.url;

        // Delete old main image if exists
        if (existingMainImageId && existingMainImageUrl) {
          await deleteImageCompletely(
            existingMainImageId,
            existingMainImageUrl,
            "post-images"
          );
        }
      }

      // 3. Get existing slugs for uniqueness check (exclude current post if editing)
      const [existingSlugsCA, existingSlugsEN] = await Promise.all([
        getExistingSlugs("ca", isEditMode ? initialData.id : undefined),
        getExistingSlugs("en", isEditMode ? initialData.id : undefined),
      ]);

      const uniqueSlugCA = generateUniqueSlug(
        data.translations.ca.slug,
        existingSlugsCA
      );
      const uniqueSlugEN = generateUniqueSlug(
        data.translations.en.slug,
        existingSlugsEN
      );

      // Note: user_id is handled automatically by the API layer for new posts
      // It gets the authenticated user from the session
      const authorName = data.author || "Admin";

      const storedPost: StoredPost = {
        id: isEditMode ? initialData.id : "", // Empty string for new posts (DB will auto-generate)
        user_id: isEditMode ? initialData.user_id : "", // API will set this for new posts
        category_id: data.category_id,
        thumbnail_id: thumbnailId,
        image_id: mainImageId,
        is_published: data.is_published,
        date: isEditMode ? initialData.date : now.split("T")[0],
        author: isEditMode ? initialData.author : authorName,
        created_at: isEditMode ? initialData.created_at : now,
        updated_at: now,
        translations: {
          ca: {
            ...data.translations.ca,
            slug: uniqueSlugCA,
            post_id: isEditMode ? initialData.id : "",
          },
          en: {
            ...data.translations.en,
            slug: uniqueSlugEN,
            post_id: isEditMode ? initialData.id : "",
          },
        },
      };

      // 5. Save post (handles both create and update)
      await savePost(storedPost);

      // 6. Update existing image IDs and URLs for next edit
      setExistingThumbnailId(thumbnailId);
      setExistingThumbnailUrl(newThumbnailUrl);
      setExistingMainImageId(mainImageId);
      setExistingMainImageUrl(newMainImageUrl);

      console.log(`Post ${isEditMode ? "updated" : "saved"} successfully`);

      // Call onSuccess callback if provided (will redirect to home page)
      if (onSuccess) {
        onSuccess();
      }

      setIsSubmitting(false);
    } catch (error: any) {
      console.error("Error saving post:", error);
      alert(error.message || "Failed to save post");
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <PostMetadataSection />

        <div className="border-t border-default pt-8">
          <Heading as="h3" size="xl">
            Content
          </Heading>
          <LanguageTabs active={activeLanguage} onChange={setActiveLanguage} />
          <TranslationSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <KeywordsSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <ReferencesSection language={activeLanguage} />
        </div>

        <div className="border-t border-default pt-8">
          <ImageSection
            thumbnailUrl={existingThumbnailUrl}
            mainImageUrl={existingMainImageUrl}
          />
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? initialData
                ? "Updating..."
                : "Saving..."
              : initialData
              ? "Update Post"
              : "Save Post"}
          </Button>
          {!initialData && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => reset()}
              disabled={isSubmitting}
            >
              Reset Form
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
