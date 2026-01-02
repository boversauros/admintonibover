'use client';

import { useState, useEffect } from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { Select, Input } from '@/components/ui';
import { PostFormData, StoredPost, Language } from '@/lib/types/post';
import { slugify, generateUniqueSlug } from '@/lib/utils/slugify';
import { savePost, getExistingSlugs } from '@/lib/api/posts';
import {
  uploadAndCreateImage,
  deleteImageCompletely,
  updateImageRecord,
} from '@/lib/api/images';
import { getCategories, type Category } from '@/lib/api/categories';
import { LanguageTabs } from './LanguageTabs';
import { TranslationSection } from './TranslationSection';
import { KeywordsSection } from './KeywordsSection';
import { ReferencesSection } from './ReferencesSection';
import { FormHeader } from './FormHeader';
import { ImageSelector } from './ImageSelector';
import { TranslationStatusPanel } from './TranslationStatusPanel';
import { CollapsibleSection } from './CollapsibleSection';

function convertToMarkdownParagraphs(content: string): string {
  return content.trim().replace(/\n+/g, '\n\n');
}

interface PostFormProps {
  initialData?: StoredPost;
  onSuccess?: () => void;
}

export function PostForm({ initialData, onSuccess }: PostFormProps) {
  const [activeLanguage, setActiveLanguage] = useState<Language>('ca');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [existingThumbnailId, setExistingThumbnailId] = useState<string | null>(
    initialData?.thumbnail_id || null
  );
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string>(
    initialData?.thumbnail?.url || ''
  );
  const [existingMainImageId, setExistingMainImageId] = useState<string | null>(
    initialData?.image_id || null
  );
  const [existingMainImageUrl, setExistingMainImageUrl] = useState<string>(
    initialData?.image?.url || ''
  );
  const [existingMainImageAlt, setExistingMainImageAlt] = useState<string>(
    initialData?.image?.alt || ''
  );

  // Load categories on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        const fetchedCategories = await getCategories();
        setCategories(fetchedCategories);
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    }
    loadCategories();
  }, []);

  const methods = useForm<PostFormData>({
    defaultValues: initialData
      ? {
          category_id: initialData.category_id,
          date: initialData.date,
          author: initialData.author,
          thumbnail_file: null,
          main_image_file: null,
          main_image_alt: initialData?.image?.alt || '',
          is_published: initialData.is_published,
          translations: {
            ca: {
              language: 'ca',
              title: initialData.translations.ca.title,
              content: initialData.translations.ca.content,
              slug: initialData.translations.ca.slug,
              keywords: initialData.translations.ca.keywords,
              references: initialData.translations.ca.references,
            },
            en: {
              language: 'en',
              title: initialData.translations.en.title,
              content: initialData.translations.en.content,
              slug: initialData.translations.en.slug,
              keywords: initialData.translations.en.keywords,
              references: initialData.translations.en.references,
            },
          },
        }
      : {
          category_id: '',
          date: '',
          author: '',
          thumbnail_file: null,
          main_image_file: null,
          main_image_alt: '',
          is_published: false,
          translations: {
            ca: {
              language: 'ca',
              title: '',
              content: '',
              slug: '',
              keywords: [],
              references: [],
            },
            en: {
              language: 'en',
              title: '',
              content: '',
              slug: '',
              keywords: [],
              references: [],
            },
          },
        },
    mode: 'onChange',
  });

  const {
    watch,
    setValue,
    handleSubmit,
    reset,
    register,
    formState: { errors },
  } = methods;

  // Auto-generate slugs from titles
  const titleCA = watch('translations.ca.title');
  const titleEN = watch('translations.en.title');
  const slugCA = watch('translations.ca.slug');
  const slugEN = watch('translations.en.slug');

  useEffect(() => {
    if (titleCA) {
      const generatedSlug = slugify(titleCA);
      // Only update if slug is empty or matches the previously generated slug
      if (!slugCA || slugCA === slugify(watch('translations.ca.title'))) {
        setValue('translations.ca.slug', generatedSlug);
      }
    }
  }, [titleCA]);

  useEffect(() => {
    if (titleEN) {
      const generatedSlug = slugify(titleEN);
      if (!slugEN || slugEN === slugify(watch('translations.en.title'))) {
        setValue('translations.en.slug', generatedSlug);
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
      // Auto-generate thumbnail alt text from post title
      const postTitle =
        data.translations.ca.title || data.translations.en.title || 'post';
      const thumbnailAlt = `Miniatura per a ${postTitle}`;

      if (data.thumbnail_file) {
        // Upload new thumbnail with auto-generated alt text
        const uploadedThumbnail = await uploadAndCreateImage(
          data.thumbnail_file,
          'post-thumbnails',
          'Post Thumbnail',
          thumbnailAlt
        );

        thumbnailId = uploadedThumbnail.id;
        newThumbnailUrl = uploadedThumbnail.url;

        // Delete old thumbnail if exists
        if (existingThumbnailId && existingThumbnailUrl) {
          await deleteImageCompletely(
            existingThumbnailId,
            existingThumbnailUrl,
            'post-thumbnails'
          );
        }
      } else if (existingThumbnailId) {
        // Update alt text for existing thumbnail (no new file uploaded)
        // Always update since alt text is auto-generated from title which may have changed
        const existingThumbnailAlt = initialData?.thumbnail?.alt || '';
        if (thumbnailAlt !== existingThumbnailAlt) {
          await updateImageRecord(existingThumbnailId, thumbnailAlt);
        }
      }

      // 2. Handle main image upload
      let mainImageId = existingMainImageId;
      let newMainImageUrl = existingMainImageUrl;
      const mainImageAlt = data.main_image_alt || '';

      if (data.main_image_file) {
        // Upload new main image with alt text
        const uploadedMainImage = await uploadAndCreateImage(
          data.main_image_file,
          'post-images',
          'Post Main Image',
          mainImageAlt
        );

        mainImageId = uploadedMainImage.id;
        newMainImageUrl = uploadedMainImage.url;

        // Delete old main image if exists
        if (existingMainImageId && existingMainImageUrl) {
          await deleteImageCompletely(
            existingMainImageId,
            existingMainImageUrl,
            'post-images'
          );
        }
      } else if (existingMainImageId && mainImageAlt !== existingMainImageAlt) {
        // Update alt text for existing main image (no new file uploaded)
        await updateImageRecord(existingMainImageId, mainImageAlt);
      }

      // 3. Get existing slugs for uniqueness check (exclude current post if editing)
      const [existingSlugsCA, existingSlugsEN] = await Promise.all([
        getExistingSlugs('ca', isEditMode ? initialData.id : undefined),
        getExistingSlugs('en', isEditMode ? initialData.id : undefined),
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
      const authorName = data.author || 'Admin';

      const storedPost: StoredPost = {
        id: isEditMode ? initialData.id : '', // Empty string for new posts (DB will auto-generate)
        user_id: isEditMode ? initialData.user_id : '', // API will set this for new posts
        category_id: data.category_id,
        thumbnail_id: thumbnailId,
        image_id: mainImageId,
        is_published: data.is_published,
        date: isEditMode ? initialData.date : now.split('T')[0],
        author: isEditMode ? initialData.author : authorName,
        created_at: isEditMode ? initialData.created_at : now,
        updated_at: now,
        translations: {
          ca: {
            ...data.translations.ca,
            content: convertToMarkdownParagraphs(data.translations.ca.content),
            slug: uniqueSlugCA,
            post_id: isEditMode ? initialData.id : '',
          },
          en: {
            ...data.translations.en,
            content: convertToMarkdownParagraphs(data.translations.en.content),
            slug: uniqueSlugEN,
            post_id: isEditMode ? initialData.id : '',
          },
        },
      };

      // 5. Save post (handles both create and update)
      await savePost(storedPost);

      // 6. Update existing image IDs, URLs, and alt text for next edit
      setExistingThumbnailId(thumbnailId);
      setExistingThumbnailUrl(newThumbnailUrl);
      setExistingMainImageId(mainImageId);
      setExistingMainImageUrl(newMainImageUrl);
      setExistingMainImageAlt(mainImageAlt);

      console.log(`Post ${isEditMode ? 'updated' : 'saved'} successfully`);

      // Call onSuccess callback if provided (will redirect to home page)
      if (onSuccess) {
        onSuccess();
      }

      setIsSubmitting(false);
    } catch (error: any) {
      console.error('Error saving post:', error);
      alert(error.message || 'Failed to save post');
      setIsSubmitting(false);
    }
  };

  const categoryOptions = categories.map(cat => ({
    value: cat.id.toString(),
    label: cat.name_ca,
  }));

  const handlePublishToggle = () => {
    setValue('is_published', !watch('is_published'));
  };

  const handleThumbnailSelect = (file: File | null) => {
    setValue('thumbnail_file', file);
  };

  const handleMainImageSelect = (file: File | null) => {
    setValue('main_image_file', file);
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="min-h-screen bg-background"
      >
        {/* Sticky Header */}
        <FormHeader
          isPublished={watch('is_published')}
          onPublishToggle={handlePublishToggle}
          isSubmitting={isSubmitting}
          isEditMode={!!initialData}
        />

        {/* Form Content */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Language Tabs */}
          <LanguageTabs
            active={activeLanguage}
            onChange={setActiveLanguage}
            hasCAContent={!!titleCA}
            hasENContent={!!titleEN}
          />

          {/* 2+1 Grid Layout */}
          <div className="grid grid-cols-3 gap-8">
            {/* Main Content - 2 columns */}
            <div className="col-span-2 space-y-6">
              {/* Translation Section (Title + Content) */}
              <TranslationSection language={activeLanguage} />

              {/* Keywords Section */}
              <KeywordsSection language={activeLanguage} />

              {/* References Section - Collapsible */}
              <CollapsibleSection title="Referències i cites">
                <ReferencesSection language={activeLanguage} />
              </CollapsibleSection>
            </div>

            {/* Sidebar - 1 column */}
            <div className="space-y-6">
              {/* Featured Image */}
              <ImageSelector
                label="Imatge destacada"
                aspectRatio="video"
                hint="16:9"
                value={existingMainImageUrl || null}
                onFileSelect={handleMainImageSelect}
                error={errors.main_image_file?.message as string}
              />
              <Input
                {...register('main_image_alt')}
                label="Text alternatiu de la imatge destacada"
                placeholder="Descriu la imatge per a l'accessibilitat"
                error={errors.main_image_alt?.message as string}
              />

              {/* Thumbnail */}
              <ImageSelector
                label="Miniatura"
                aspectRatio="thumbnail"
                hint="4:3 · Per llistats"
                value={existingThumbnailUrl || null}
                onFileSelect={handleThumbnailSelect}
                error={errors.thumbnail_file?.message as string}
              />

              {/* Category */}
              <div className="space-y-2">
                <label className="block text-xs text-muted uppercase tracking-wider">
                  Categoria
                </label>
                <Select
                  {...register('category_id')}
                  options={categoryOptions}
                  placeholder="Selecciona..."
                  error={errors.category_id?.message as string}
                />
              </div>

              {/* Translation Status Panel */}
              <TranslationStatusPanel
                hasCATitle={!!titleCA}
                hasENTitle={!!titleEN}
              />
            </div>
          </div>
        </main>
      </form>
    </FormProvider>
  );
}
