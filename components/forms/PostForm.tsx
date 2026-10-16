'use client';

import {
  type BaseSyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Controller,
  FormProvider,
  useForm,
  useWatch,
  type SubmitErrorHandler,
} from 'react-hook-form';
import { Button, Select, Input, Modal, Text } from '@/components/ui';
import { useKeywords } from '@/lib/hooks/useKeywords';
import { PostFormData, StoredPost, Language } from '@/lib/types/post';
import { slugify } from '@/lib/utils/slugify';
import { isLegacyNumericSlug } from '@/lib/domain/posts/public-slugs';
import {
  AdminMutationError,
  buildAwsPost,
  countAdminPosts,
  createAwsPost,
  detachAwsPostImage,
  getAwsMediaInspection,
  setAwsPostPublication,
  updateAwsPost,
  uploadAwsPostImage,
} from '@/lib/api/adminMutations';
import {
  adaptAwsPost,
  getAdminCategories,
  type AdminCategory,
} from '@/lib/api/adminReads';
import type { Post } from '@/lib/domain/posts/types';
import type { ImagePreview, ImageRole } from '@/lib/domain/media/contracts';
import {
  postFormWithSlugsResolver,
  type PostFormSlugContext,
} from '@/lib/validation/postSlugRules';
import { LanguageTabs } from './LanguageTabs';
import { TranslationSection } from './TranslationSection';
import { KeywordsSection } from './KeywordsSection';
import { ReferencesSection } from './ReferencesSection';
import { FormHeader } from './FormHeader';
import { ImageDropzone } from './ImageDropzone';
import { TranslationStatusPanel } from './TranslationStatusPanel';
import { PublicationStatusPanel } from './PublicationStatusPanel';
import { CollapsibleSection } from './CollapsibleSection';

function convertToMarkdownParagraphs(content: string): string {
  return content.trim().replace(/\n+/g, '\n\n');
}

function recoveryDraft(data: PostFormData): string {
  return JSON.stringify(
    {
      ...data,
      thumbnail_file: data.thumbnail_file
        ? {
            name: data.thumbnail_file.name,
            size: data.thumbnail_file.size,
            type: data.thumbnail_file.type,
          }
        : null,
      main_image_file: data.main_image_file
        ? {
            name: data.main_image_file.name,
            size: data.main_image_file.size,
            type: data.main_image_file.type,
          }
        : null,
    },
    null,
    2
  );
}

type ConflictState = {
  message: string;
  recovery: string;
  requestId?: string;
};

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
  const [savedAwsPost, setSavedAwsPost] = useState<Post | null>(
    initialData?.aws_post ?? null
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [newAwsPostId, setNewAwsPostId] = useState<string | null>(null);
  const [existingThumbnailId, setExistingThumbnailId] = useState<string | null>(
    initialData?.thumbnail_id || null
  );
  const [existingMainImageId, setExistingMainImageId] = useState<string | null>(
    initialData?.image_id || null
  );
  const [awsMainImage, setAwsMainImage] = useState<ImagePreview | null>(() =>
    initialData?.aws_post?.mainImage
      ? {
          image: initialData.aws_post.mainImage,
          previewUrl: initialData.image?.url ?? null,
          previewExpiresAt: null,
        }
      : null
  );
  const [awsThumbnailImage, setAwsThumbnailImage] =
    useState<ImagePreview | null>(() =>
      initialData?.aws_post?.thumbImage
        ? {
            image: initialData.aws_post.thumbImage,
            previewUrl: initialData.thumbnail?.url ?? null,
            previewExpiresAt: null,
          }
        : null
    );
  const [pendingRemoval, setPendingRemoval] = useState<
    Record<ImageRole, boolean>
  >({ main: false, thumb: false });

  const activeAwsPostId = savedAwsPost?.id ?? initialData?.id;

  // Load categories on mount
  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        setCategoryError(null);
        const fetchedCategories = await getAdminCategories(controller.signal);
        setCategories(fetchedCategories);
        if (fetchedCategories.length === 0) {
          setCategoryError(
            'No hi ha categories disponibles. Cal crear-ne una abans de desar un article.'
          );
        }
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
  }, [categoryRetry]);

  const applyAwsInspection = useCallback(
    (inspection: Awaited<ReturnType<typeof getAwsMediaInspection>>) => {
      const main = inspection.images.main;
      const thumb = inspection.images.thumb;
      setAwsMainImage(main);
      setAwsThumbnailImage(thumb);
      setExistingMainImageId(main?.image.key ?? null);
      setExistingThumbnailId(thumb?.image.key ?? null);
      setSavedAwsPost(current =>
        current
          ? {
              ...current,
              mainImage: main?.image ?? null,
              thumbImage: thumb?.image ?? null,
              version: inspection.postVersion,
            }
          : current
      );
    },
    []
  );

  const refreshAwsMedia = useCallback(async () => {
    if (!activeAwsPostId) return;
    const inspection = await getAwsMediaInspection(activeAwsPostId);
    applyAwsInspection(inspection);
  }, [activeAwsPostId, applyAwsInspection]);

  useEffect(() => {
    if (!activeAwsPostId) return;
    const controller = new AbortController();
    void getAwsMediaInspection(activeAwsPostId, controller.signal)
      .then(applyAwsInspection)
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSubmissionError(
          error instanceof Error
            ? error.message
            : 'No s’han pogut carregar les imatges privades.'
        );
      });
    return () => controller.abort();
  }, [activeAwsPostId, applyAwsInspection]);

  // Categories load after the form is created; the resolver reads them here.
  const categorySlugsRef = useRef<string[]>([]);
  useEffect(() => {
    categorySlugsRef.current = categories.map(category => category.slug);
  }, [categories]);
  const methods = useForm<PostFormData, PostFormSlugContext>({
    resolver: (values, context, options) =>
      postFormWithSlugsResolver(
        values,
        {
          requireCompleteTranslations:
            context?.requireCompleteTranslations === true,
          categorySlugs: categorySlugsRef.current,
        },
        options
      ),
    context: { requireCompleteTranslations: true },
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
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    shouldFocusError: false,
  });

  const {
    control,
    setValue,
    setFocus,
    handleSubmit,
    register,
    formState: { errors },
  } = methods;

  // On create, default sort_order to total posts + 1
  useEffect(() => {
    if (initialData || readOnly) return;
    const controller = new AbortController();
    void countAdminPosts(controller.signal)
      .then(count => setValue('sort_order', count + 1))
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSubmissionError('No s’ha pogut calcular l’ordre inicial.');
      });
    return () => controller.abort();
  }, [initialData, readOnly, setValue]);

  // Auto-generate slugs from titles. An imported numeric slug (the old `-N`
  // placeholder) is replaced too, so saving the post fixes its address.
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
  const [mainImageFile, thumbnailFile] = useWatch({
    control: methods.control,
    name: ['main_image_file', 'thumbnail_file'],
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
      if (
        !slugCA ||
        slugCA === previousAutoSlugCA.current ||
        isLegacyNumericSlug(slugCA, titleCA)
      ) {
        setValue('translations.ca.slug', generatedSlug);
      }
      previousAutoSlugCA.current = generatedSlug;
    }
  }, [setValue, slugCA, titleCA]);

  useEffect(() => {
    if (titleEN) {
      const generatedSlug = slugify(titleEN);
      if (
        !slugEN ||
        slugEN === previousAutoSlugEN.current ||
        isLegacyNumericSlug(slugEN, titleEN)
      ) {
        setValue('translations.en.slug', generatedSlug);
      }
      previousAutoSlugEN.current = generatedSlug;
    }
  }, [setValue, slugEN, titleEN]);

  function formStoredPost(
    data: PostFormData,
    base: StoredPost | undefined,
    now: string,
    slugs: { ca: string; en: string }
  ): StoredPost {
    const postId = base?.id ?? '';
    return {
      id: postId,
      user_id: base?.user_id ?? '',
      category_id: data.category_id,
      sort_order:
        typeof data.sort_order === 'number' && Number.isFinite(data.sort_order)
          ? data.sort_order
          : 0,
      thumbnail_id: base?.thumbnail_id ?? existingThumbnailId,
      thumbnail: base?.thumbnail,
      image_id: base?.image_id ?? existingMainImageId,
      image: base?.image,
      is_published: data.is_published,
      date: base?.date ?? now.split('T')[0],
      author: base?.author ?? (data.author || 'Admin'),
      created_at: base?.created_at ?? now,
      updated_at: now,
      version: base?.version,
      aws_post: base?.aws_post,
      translations: {
        ca: {
          ...data.translations.ca,
          content: convertToMarkdownParagraphs(data.translations.ca.content),
          slug: slugs.ca,
          post_id: postId,
        },
        en: {
          ...data.translations.en,
          content: convertToMarkdownParagraphs(data.translations.en.content),
          slug: slugs.en,
          post_id: postId,
        },
      },
    };
  }

  async function submitAws(data: PostFormData): Promise<void> {
    const now = new Date().toISOString();
    const current = savedAwsPost ?? initialData?.aws_post;
    const base = current ? adaptAwsPost(current) : initialData;
    const category = categories.find(item => item.id === data.category_id);
    if (!category) {
      throw new AdminMutationError(
        'Selecciona una categoria vàlida abans de desar.',
        400,
        'INVALID_CATEGORY'
      );
    }
    const storedPost = formStoredPost(data, base, now, {
      ca: data.translations.ca.slug,
      en: data.translations.en.slug,
    });
    const stablePostId = newAwsPostId ?? `post-${crypto.randomUUID()}`;
    if (!newAwsPostId) setNewAwsPostId(stablePostId);
    let canonical = buildAwsPost(storedPost, {
      categorySlug: category.slug,
      postId: stablePostId,
      published: current?.published ?? false,
      now,
    });
    // The alt text is saved with the post, independently of the image file.
    const mainImageAlt = data.main_image_alt ?? '';
    if (canonical.mainImage) {
      canonical = {
        ...canonical,
        mainImage: { ...canonical.mainImage, alt: mainImageAlt },
      };
    }

    let altNotSaved = false;
    if (current) {
      canonical = await updateAwsPost(canonical, current.version);
      // An old admin Lambda silently keeps the stored alt; surface that.
      altNotSaved =
        !data.main_image_file &&
        !pendingRemoval.main &&
        canonical.mainImage !== null &&
        canonical.mainImage.alt !== mainImageAlt;
    } else {
      canonical = await createAwsPost(canonical);
      window.history.replaceState(
        null,
        '',
        `/reflexions/${encodeURIComponent(canonical.id)}/edit`
      );
    }
    setSavedAwsPost(canonical);
    const savedMainImage = canonical.mainImage;
    if (savedMainImage) {
      setAwsMainImage(preview =>
        preview ? { ...preview, image: savedMainImage } : preview
      );
    }
    setSaveNotice(
      'El text ja està desat. Si una imatge falla, podràs tornar a desar des d’aquest article.'
    );

    if (!data.is_published && canonical.published) {
      canonical = await setAwsPostPublication(
        canonical.id,
        canonical.version,
        false
      );
      setSavedAwsPost(canonical);
    }

    const postTitle =
      data.translations.ca.title || data.translations.en.title || 'post';
    if (data.main_image_file) {
      const confirmed = await uploadAwsPostImage({
        postId: canonical.id,
        postVersion: canonical.version,
        role: 'main',
        file: data.main_image_file,
        title: 'Post Main Image',
        alt: mainImageAlt,
      });
      canonical = {
        ...canonical,
        mainImage: confirmed.image.image,
        version: confirmed.postVersion,
        updatedAt: confirmed.image.image.updatedAt,
      };
      setSavedAwsPost(canonical);
      setAwsMainImage(confirmed.image);
      setExistingMainImageId(confirmed.image.image.key);
      setValue('main_image_file', null);
      setPendingRemoval(state => ({ ...state, main: false }));
    }

    if (data.thumbnail_file) {
      const confirmed = await uploadAwsPostImage({
        postId: canonical.id,
        postVersion: canonical.version,
        role: 'thumb',
        file: data.thumbnail_file,
        title: 'Post Thumbnail',
        alt: `Miniatura per a ${postTitle}`,
      });
      canonical = {
        ...canonical,
        thumbImage: confirmed.image.image,
        version: confirmed.postVersion,
        updatedAt: confirmed.image.image.updatedAt,
      };
      setSavedAwsPost(canonical);
      setAwsThumbnailImage(confirmed.image);
      setExistingThumbnailId(confirmed.image.image.key);
      setValue('thumbnail_file', null);
      setPendingRemoval(state => ({ ...state, thumb: false }));
    }

    for (const role of ['main', 'thumb'] as const) {
      const field = role === 'main' ? 'mainImage' : 'thumbImage';
      if (!pendingRemoval[role] || !canonical[field]) continue;
      const detached = await detachAwsPostImage({
        postId: canonical.id,
        postVersion: canonical.version,
        role,
      });
      canonical = {
        ...canonical,
        [field]: null,
        version: detached.postVersion,
      };
      setSavedAwsPost(canonical);
      if (role === 'main') {
        setAwsMainImage(null);
        setExistingMainImageId(null);
      } else {
        setAwsThumbnailImage(null);
        setExistingThumbnailId(null);
      }
      setPendingRemoval(state => ({ ...state, [role]: false }));
    }

    if (data.is_published && !canonical.published) {
      canonical = await setAwsPostPublication(
        canonical.id,
        canonical.version,
        true
      );
      setSavedAwsPost(canonical);
    }
    setSaveNotice(null);
    if (altNotSaved) {
      throw new AdminMutationError(
        'L’article s’ha desat, però el servidor no ha acceptat el text alternatiu. Cal desplegar la versió nova del backend.',
        502,
        'IMAGE_ALT_NOT_SAVED'
      );
    }
  }

  const onSubmit = async (data: PostFormData, event?: BaseSyntheticEvent) => {
    const form =
      event?.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : null;
    if (isSubmitting || readOnly || form?.dataset.submitting === 'true') return;
    if (form) form.dataset.submitting = 'true';
    setIsSubmitting(true);
    setSubmissionError(null);
    setConflict(null);
    setRecoveryCopied(false);
    try {
      await submitAws(data);
      onSuccess?.();
    } catch (error) {
      if (error instanceof AdminMutationError && error.status === 409) {
        setConflict({
          message: error.message,
          recovery: recoveryDraft(data),
          requestId: error.requestId,
        });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : 'No s’ha pogut desar l’article.';
        const requestId =
          error instanceof AdminMutationError ? error.requestId : undefined;
        setSubmissionError(
          requestId ? `${message} Correlació: ${requestId}` : message
        );
      }
    } finally {
      if (form) delete form.dataset.submitting;
      setIsSubmitting(false);
    }
  };

  const onInvalid: SubmitErrorHandler<PostFormData> = validationErrors => {
    const caErrors = validationErrors.translations?.ca;
    const enErrors = validationErrors.translations?.en;
    const language = caErrors ? 'ca' : enErrors ? 'en' : null;
    const field = language
      ? validationErrors.translations?.[language]?.title
        ? 'title'
        : 'content'
      : null;

    if (language && field) {
      setActiveLanguage(language);
      window.requestAnimationFrame(() =>
        setFocus(`translations.${language}.${field}`)
      );
    } else if (validationErrors.category_id) {
      setFocus('category_id');
    }

    setSubmissionError(
      'Revisa els camps obligatoris indicats abans de crear l’article.'
    );
  };

  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: cat.nameCa,
  }));

  const handlePublishToggle = (checked: boolean) => {
    setValue('is_published', checked);
  };

  const handleImageSelect = (role: ImageRole, file: File | null) => {
    setValue(role === 'main' ? 'main_image_file' : 'thumbnail_file', file);
    setPendingRemoval(state => ({ ...state, [role]: false }));
  };

  // Removing clears a staged file and, when the post has a saved image, marks
  // it to be detached on save so the slot ends up empty.
  const handleImageRemove = (role: ImageRole) => {
    const hasSaved = role === 'main' ? !!awsMainImage : !!awsThumbnailImage;
    setValue(role === 'main' ? 'main_image_file' : 'thumbnail_file', null);
    setPendingRemoval(state => ({ ...state, [role]: hasSaved }));
  };

  const handleCopyRecovery = async () => {
    if (!conflict) return;
    try {
      await navigator.clipboard.writeText(conflict.recovery);
      setRecoveryCopied(true);
    } catch {
      setSubmissionError(
        'No s’ha pogut copiar automàticament. Selecciona el text de recuperació manualment.'
      );
    }
  };

  const handleConflictReload = () => {
    const postId = savedAwsPost?.id ?? initialData?.id ?? newAwsPostId;
    window.location.assign(postId ? `/reflexions/${postId}/edit` : '/');
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className="min-h-screen bg-background"
      >
        {/* Sticky Header */}
        <FormHeader
          isSubmitting={isSubmitting}
          isEditMode={!!initialData || !!savedAwsPost}
          readOnly={readOnly}
        />

        {saveNotice || submissionError ? (
          <div className="mx-auto mt-4 max-w-6xl space-y-3 px-4 sm:px-6">
            {saveNotice ? (
              <div
                className="border border-success/30 bg-success/5 px-4 py-3"
                role="status"
              >
                <Text variant="small">{saveNotice}</Text>
              </div>
            ) : null}
            {submissionError ? (
              <div
                className="border border-danger/30 bg-danger/5 px-4 py-3"
                role="alert"
              >
                <Text variant="small" className="text-body">
                  {submissionError}
                </Text>
              </div>
            ) : null}
          </div>
        ) : null}

        {readOnly && (
          <div
            id="aws-read-only-notice"
            className="max-w-6xl mx-auto mt-6 px-4 sm:px-6"
            role="status"
          >
            <div className="border border-warning/30 bg-warning/5 px-4 py-3">
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
                className="flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/5 px-4 py-3"
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
                className="flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/5 px-4 py-3"
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
                <ImageDropzone
                  label="Imatge destacada"
                  hint="16:9 · imatge de capçalera"
                  aspectRatio="video"
                  file={mainImageFile ?? null}
                  hasSavedImage={awsMainImage !== null}
                  savedUrl={awsMainImage?.previewUrl ?? null}
                  removalPending={pendingRemoval.main}
                  disabled={readOnly || isSubmitting}
                  error={errors.main_image_file?.message as string}
                  onSelect={file => handleImageSelect('main', file)}
                  onRemove={() => handleImageRemove('main')}
                  onUndoRemove={() => handleImageSelect('main', null)}
                  onPreviewError={() => void refreshAwsMedia()}
                />
                <Input
                  {...register('main_image_alt')}
                  label="Text alternatiu de la imatge destacada"
                  placeholder="Descriu la imatge per a l'accessibilitat"
                  helperText="Es mostra sota la imatge a l’article publicat. Es desa amb l’article."
                  error={errors.main_image_alt?.message as string}
                />

                {/* Thumbnail */}
                <ImageDropzone
                  label="Miniatura"
                  hint="4:3 · per als llistats"
                  aspectRatio="thumbnail"
                  file={thumbnailFile ?? null}
                  hasSavedImage={awsThumbnailImage !== null}
                  savedUrl={awsThumbnailImage?.previewUrl ?? null}
                  removalPending={pendingRemoval.thumb}
                  disabled={readOnly || isSubmitting}
                  error={errors.thumbnail_file?.message as string}
                  onSelect={file => handleImageSelect('thumb', file)}
                  onRemove={() => handleImageRemove('thumb')}
                  onUndoRemove={() => handleImageSelect('thumb', null)}
                  onPreviewError={() => void refreshAwsMedia()}
                />

                {/* Category */}
                <div className="space-y-2">
                  <label className="block text-xs text-muted uppercase tracking-wider">
                    Categoria
                  </label>
                  <Controller
                    control={control}
                    name="category_id"
                    render={({ field, fieldState }) => (
                      <Select
                        {...field}
                        options={categoryOptions}
                        placeholder={
                          categoryError
                            ? 'Categories no disponibles'
                            : 'Selecciona...'
                        }
                        error={fieldState.error?.message}
                      />
                    )}
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
        <Modal
          isOpen={conflict !== null}
          onClose={() => setConflict(null)}
          title="Hi ha una versió més recent"
          closeOnBackdropClick={false}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConflict(null)}>
                Continuar revisant
              </Button>
              <Button variant="secondary" onClick={handleCopyRecovery}>
                {recoveryCopied ? 'Dades copiades' : 'Copiar les meves dades'}
              </Button>
              <Button variant="primary" onClick={handleConflictReload}>
                Recarregar versió actual
              </Button>
            </>
          }
        >
          {conflict ? (
            <div className="space-y-4">
              <Text>{conflict.message}</Text>
              {conflict.requestId ? (
                <Text variant="small" className="text-subtle">
                  Correlació: {conflict.requestId}
                </Text>
              ) : null}
              <div className="space-y-2">
                <label
                  htmlFor="conflict-recovery"
                  className="block text-xs uppercase tracking-wider text-muted"
                >
                  Còpia de recuperació
                </label>
                <textarea
                  id="conflict-recovery"
                  readOnly
                  value={conflict.recovery}
                  className="min-h-40 w-full resize-y border border-default bg-background p-3 font-mono text-xs text-body"
                  onFocus={event => event.currentTarget.select()}
                />
              </div>
            </div>
          ) : null}
        </Modal>
      </form>
    </FormProvider>
  );
}
