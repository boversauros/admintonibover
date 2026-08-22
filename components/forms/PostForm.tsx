'use client';

import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button, Select, Input, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';
import { useKeywords } from '@/lib/hooks/useKeywords';
import { PostFormData, StoredPost, Language } from '@/lib/types/post';
import { slugify, generateUniqueSlug } from '@/lib/utils/slugify';
import { savePost, getExistingSlugs, getPostsCount } from '@/lib/api/posts';
import {
  uploadAndCreateImage,
  deleteImageCompletely,
  updateImageRecord,
} from '@/lib/api/images';
import { getAdminCategories, type AdminCategory } from '@/lib/api/adminReads';
import { LanguageTabs } from './LanguageTabs';
import { TranslationSection } from './TranslationSection';
import { KeywordsSection } from './KeywordsSection';
import { ReferencesSection } from './ReferencesSection';
import { FormHeader } from './FormHeader';
import { ImageSelector } from './ImageSelector';
import { TranslationStatusPanel } from './TranslationStatusPanel';
import { PublicationStatusPanel } from './PublicationStatusPanel';
import { CollapsibleSection } from './CollapsibleSection';

function convertToMarkdownParagraphs(content: string): string {
  return content.trim().replace(/\n+/g, '\n\n');
}

interface PostFormProps {
  initialData?: StoredPost;
  onSuccess?: () => void;
  readOnly?: boolean;
}

export function PostForm({
  initialData,
  onSuccess,
  readOnly = false,
}: PostFormProps) {
  const { backend } = useAuth();
  const {
    keywords,
    isLoading: areKeywordsLoading,
    error: keywordsError,
    refetch: refetchKeywords,
  } = useKeywords();
  const [activeLanguage, setActiveLanguage] = useState<Language>('ca');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryRetry, setCategoryRetry] = useState(0);
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
    const controller = new AbortController();
    async function loadCategories() {
      try {
        setCategoryError(null);
        const fetchedCategories = await getAdminCategories(
          backend,
          controller.signal
        );
        setCategories(fetchedCategories);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCategoryError(
          error instanceof Error
            ? error.message
            : 'No s’han pogut carregar les categories.'
        );
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, [backend, categoryRetry]);

  const methods = useForm<PostFormData>({
    defaultValues: initialData
      ? {
          category_id: initialData.category_id,
          sort_order: initialData.sort_order ?? 0,
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
          sort_order: 0,
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
    setValue,
    handleSubmit,
    register,
    formState: { errors },
  } = methods;

  // On create, default sort_order to total posts + 1
  useEffect(() => {
    if (initialData || readOnly || backend === 'aws') return;
    getPostsCount()
      .then(count => setValue('sort_order', count + 1))
      .catch(error => console.error('Failed to load posts count:', error));
  }, [backend, initialData, readOnly, setValue]);

  // Auto-generate slugs from titles
  const [titleCA, titleEN, slugCA, slugEN, isPublished] = useWatch({
    control: methods.control,
    name: [
      'translations.ca.title',
      'translations.en.title',
      'translations.ca.slug',
      'translations.en.slug',
      'is_published',
    ],
  });
  const previousAutoSlugCA = useRef(
    initialData ? slugify(initialData.translations.ca.title) : ''
  );
  const previousAutoSlugEN = useRef(
    initialData ? slugify(initialData.translations.en.title) : ''
  );

  useEffect(() => {
    if (titleCA) {
      const generatedSlug = slugify(titleCA);
      if (!slugCA || slugCA === previousAutoSlugCA.current) {
        setValue('translations.ca.slug', generatedSlug);
      }
      previousAutoSlugCA.current = generatedSlug;
    }
  }, [setValue, slugCA, titleCA]);

  useEffect(() => {
    if (titleEN) {
      const generatedSlug = slugify(titleEN);
      if (!slugEN || slugEN === previousAutoSlugEN.current) {
        setValue('translations.en.slug', generatedSlug);
      }
      previousAutoSlugEN.current = generatedSlug;
    }
  }, [setValue, slugEN, titleEN]);

  const onSubmit = async (data: PostFormData) => {
    if (isSubmitting || readOnly) return; // Prevent multiple submissions and AWS writes

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

      const sortOrder =
        typeof data.sort_order === 'number' && Number.isFinite(data.sort_order)
          ? data.sort_order
          : 0;

      const storedPost: StoredPost = {
        id: isEditMode ? initialData.id : '', // Empty string for new posts (DB will auto-generate)
        user_id: isEditMode ? initialData.user_id : '', // API will set this for new posts
        category_id: data.category_id,
        sort_order: sortOrder,
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
    } catch (error) {
      console.error('Error saving post:', error);
      alert(error instanceof Error ? error.message : 'Failed to save post');
      setIsSubmitting(false);
    }
  };

  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: cat.nameCa,
  }));

  const handlePublishToggle = (checked: boolean) => {
    setValue('is_published', checked);
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
          isSubmitting={isSubmitting}
          isEditMode={!!initialData}
          readOnly={readOnly}
        />

        {readOnly && (
          <div
            id="aws-read-only-notice"
            className="max-w-6xl mx-auto mt-6 px-4 sm:px-6"
            role="status"
          >
            <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <Text variant="small">
                Les dades provenen de l’API d’AWS. L’edició estarà disponible
                quan s’activin les operacions d’escriptura.
              </Text>
            </div>
          </div>
        )}

        {categoryError || keywordsError ? (
          <div className="max-w-6xl mx-auto mt-4 space-y-3 px-4 sm:px-6">
            {categoryError ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3"
                role="alert"
              >
                <Text variant="small">{categoryError}</Text>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCategoryRetry(value => value + 1)}
                >
                  Reintentar categories
                </Button>
              </div>
            ) : null}
            {keywordsError ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3"
                role="alert"
              >
                <Text variant="small">{keywordsError.message}</Text>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void refetchKeywords()}
                >
                  Reintentar paraules clau
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Form Content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {/* Language navigation remains available in read-only mode. */}
          <LanguageTabs
            active={activeLanguage}
            onChange={setActiveLanguage}
            hasCAContent={!!titleCA}
            hasENContent={!!titleEN}
          />

          <fieldset
            disabled={readOnly}
            aria-describedby={readOnly ? 'aws-read-only-notice' : undefined}
            className="m-0 min-w-0 border-0 p-0 disabled:opacity-80"
          >
            {/* 2+1 Grid Layout */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Main Content - 2 columns */}
              <div className="space-y-6 lg:col-span-2">
                {/* Translation Section (Title + Content) */}
                <TranslationSection language={activeLanguage} />

                {/* Keywords Section */}
                <KeywordsSection
                  language={activeLanguage}
                  suggestions={keywords[activeLanguage]}
                  isLoading={areKeywordsLoading}
                />

                {/* References Section - Collapsible */}
                <CollapsibleSection
                  title="Referències i cites"
                  defaultOpen={readOnly}
                >
                  <ReferencesSection language={activeLanguage} />
                </CollapsibleSection>
              </div>

              {/* Sidebar - 1 column */}
              <div className="space-y-6">
                <Input
                  type="number"
                  label="Ordre"
                  min={0}
                  step={1}
                  helperText="Nombre més baix = més amunt al lloc públic (ordenació ascendent)"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                  {...register('sort_order', { valueAsNumber: true })}
                />

                {/* Publication Status Panel */}
                <PublicationStatusPanel
                  isPublished={isPublished}
                  onToggle={handlePublishToggle}
                />

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
                    placeholder={
                      categoryError
                        ? 'Categories no disponibles'
                        : 'Selecciona...'
                    }
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
          </fieldset>
        </main>
      </form>
    </FormProvider>
  );
}
