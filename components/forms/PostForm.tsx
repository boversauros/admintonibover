'use client';

import { type BaseSyntheticEvent, useEffect, useRef, useState } from 'react';
import {
  Controller,
  FormProvider,
  useForm,
  useWatch,
  type SubmitErrorHandler,
} from 'react-hook-form';
import { Button, Select, Input, Text } from '@/components/ui';
import { useKeywords } from '@/lib/hooks/useKeywords';
import {
  AdminMutationError,
  createAwsPost,
  detachAwsPostImage,
  setAwsPostPublication,
  updateAwsPost,
  uploadAwsPostImage,
} from '@/lib/api/adminMutations';
import type { Post, PostLanguage } from '@/lib/domain/posts/types';
import type { ImageRole } from '@/lib/domain/media/contracts';
import {
  newPostFormId,
  postFormValues,
  type PostFormValues,
} from '@/lib/forms/postForm';
import {
  formResetsAfter,
  imageFileField,
  savePost,
  type SavePostApi,
  type SaveStep,
} from '@/lib/forms/savePost';
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
import { SaveConflictModal, type SaveConflict } from './SaveConflictModal';
import {
  useAdminCategories,
  useAutoSlug,
  useDefaultSortOrder,
  usePostRecord,
} from './postFormHooks';

const SAVE_API: SavePostApi = {
  create: post => createAwsPost(post),
  update: (post, expectedVersion) => updateAwsPost(post, expectedVersion),
  setPublication: setAwsPostPublication,
  uploadImage: uploadAwsPostImage,
  detachImage: detachAwsPostImage,
};

function fileSummary(file: File | null) {
  return file ? { name: file.name, size: file.size, type: file.type } : null;
}

function recoveryDraft(data: PostFormValues): string {
  return JSON.stringify(
    {
      ...data,
      mainImageFile: fileSummary(data.mainImageFile),
      thumbImageFile: fileSummary(data.thumbImageFile),
    },
    null,
    2
  );
}

interface PostFormProps {
  initialData?: Post;
  onSuccess?: () => void;
}

export function PostForm({ initialData, onSuccess }: PostFormProps) {
  const {
    keywords,
    isLoading: areKeywordsLoading,
    error: keywordsError,
    refetch: refetchKeywords,
  } = useKeywords();
  const {
    categories,
    error: categoryError,
    retry: retryCategories,
  } = useAdminCategories();
  const [activeLanguage, setActiveLanguage] = useState<PostLanguage>('ca');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  // Generated once, so retrying a failed create cannot make a second post.
  const [newPostId] = useState(() => newPostFormId('post'));
  const { record, dispatch, refreshMedia } = usePostRecord(
    initialData,
    setSubmissionError
  );

  // Categories load after the form is created; the resolver reads them here.
  const categorySlugsRef = useRef<string[]>([]);
  useEffect(() => {
    categorySlugsRef.current = categories.map(category => category.slug);
  }, [categories]);
  const methods = useForm<PostFormValues, PostFormSlugContext>({
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
    defaultValues: postFormValues(initialData),
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

  useDefaultSortOrder(!initialData, setValue, setSubmissionError);
  const titleCA = useAutoSlug(
    control,
    setValue,
    'ca',
    initialData?.translations.ca.title
  );
  const titleEN = useAutoSlug(
    control,
    setValue,
    'en',
    initialData?.translations.en.title
  );
  const [isPublished, mainImageFile, thumbImageFile, removeImage] = useWatch({
    control,
    name: ['published', 'mainImageFile', 'thumbImageFile', 'removeImage'],
  });

  const applySaveStep = (step: SaveStep) => {
    dispatch(step);
    if (step.type === 'saved' && step.created) {
      window.history.replaceState(
        null,
        '',
        `/reflexions/${encodeURIComponent(step.post.id)}/edit`
      );
    }
    if (step.type === 'saved') {
      setSaveNotice(
        'El text ja està desat. Si una imatge falla, podràs tornar a desar des d’aquest article.'
      );
    }
    const { clearFile, clearRemoval } = formResetsAfter(step);
    if (clearFile) setValue(clearFile, null);
    if (clearRemoval) setValue(`removeImage.${clearRemoval}`, false);
  };

  const onSubmit = async (data: PostFormValues, event?: BaseSyntheticEvent) => {
    const form =
      event?.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : null;
    if (form?.dataset.submitting === 'true') return;
    if (form) form.dataset.submitting = 'true';
    setIsSubmitting(true);
    setSubmissionError(null);
    setConflict(null);
    try {
      const category = categories.find(item => item.id === data.categoryId);
      if (!category) {
        throw new AdminMutationError(
          'Selecciona una categoria vàlida abans de desar.',
          400,
          'INVALID_CATEGORY'
        );
      }
      await savePost(data, {
        api: SAVE_API,
        category,
        current: record.post ?? undefined,
        now: new Date().toISOString(),
        onStep: applySaveStep,
        postId: newPostId,
      });
      setSaveNotice(null);
      onSuccess?.();
    } catch (error) {
      if (
        error instanceof AdminMutationError &&
        error.code === 'IMAGE_ALT_NOT_SAVED'
      ) {
        setSaveNotice(null);
      }
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

  const onInvalid: SubmitErrorHandler<PostFormValues> = validationErrors => {
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
    } else if (validationErrors.categoryId) {
      setFocus('categoryId');
    }

    setSubmissionError(
      'Revisa els camps obligatoris indicats abans de crear l’article.'
    );
  };

  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: cat.nameCa,
  }));

  const handleImageSelect = (role: ImageRole, file: File | null) => {
    setValue(imageFileField(role), file);
    setValue(`removeImage.${role}`, false);
  };

  // Removing clears a staged file and, when the post has a saved image, marks
  // it to be detached on save so the slot ends up empty.
  const handleImageRemove = (role: ImageRole) => {
    setValue(imageFileField(role), null);
    setValue(`removeImage.${role}`, record.previews[role] !== null);
  };

  const handleConflictReload = () => {
    const postId = record.post?.id ?? newPostId;
    // A full reload drops the stale form state and loads the current version.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/reflexions/${encodeURIComponent(postId)}/edit`);
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className="min-h-screen bg-background"
      >
        <FormHeader
          isSubmitting={isSubmitting}
          isEditMode={record.post !== null}
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
                  onClick={retryCategories}
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

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <LanguageTabs
            active={activeLanguage}
            onChange={setActiveLanguage}
            hasCAContent={!!titleCA}
            hasENContent={!!titleEN}
          />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <TranslationSection language={activeLanguage} />
              <KeywordsSection
                language={activeLanguage}
                suggestions={keywords[activeLanguage]}
                isLoading={areKeywordsLoading}
              />
              <CollapsibleSection title="Referències i cites">
                <ReferencesSection language={activeLanguage} />
              </CollapsibleSection>
            </div>

            <div className="space-y-6">
              <Input
                type="number"
                label="Ordre"
                min={0}
                step={1}
                helperText="Nombre més baix = més amunt al lloc públic (ordenació ascendent)"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                {...register('sortOrder', { valueAsNumber: true })}
              />

              <PublicationStatusPanel
                isPublished={isPublished}
                onToggle={checked => setValue('published', checked)}
              />

              <ImageDropzone
                label="Imatge destacada"
                hint="16:9 · imatge de capçalera"
                aspectRatio="video"
                file={mainImageFile}
                hasSavedImage={record.previews.main !== null}
                savedUrl={record.previews.main?.previewUrl ?? null}
                removalPending={removeImage.main}
                disabled={isSubmitting}
                error={errors.mainImageFile?.message as string}
                onSelect={file => handleImageSelect('main', file)}
                onRemove={() => handleImageRemove('main')}
                onUndoRemove={() => handleImageSelect('main', null)}
                onPreviewError={() => void refreshMedia()}
              />
              <Input
                {...register('mainImageAlt')}
                label="Text alternatiu de la imatge destacada"
                placeholder="Descriu la imatge per a l'accessibilitat"
                helperText="Es mostra sota la imatge a l’article publicat. Es desa amb l’article."
                error={errors.mainImageAlt?.message as string}
              />

              <ImageDropzone
                label="Miniatura"
                hint="4:3 · per als llistats"
                aspectRatio="thumbnail"
                file={thumbImageFile}
                hasSavedImage={record.previews.thumb !== null}
                savedUrl={record.previews.thumb?.previewUrl ?? null}
                removalPending={removeImage.thumb}
                disabled={isSubmitting}
                error={errors.thumbImageFile?.message as string}
                onSelect={file => handleImageSelect('thumb', file)}
                onRemove={() => handleImageRemove('thumb')}
                onUndoRemove={() => handleImageSelect('thumb', null)}
                onPreviewError={() => void refreshMedia()}
              />

              <div className="space-y-2">
                <label className="block text-xs text-muted uppercase tracking-wider">
                  Categoria
                </label>
                <Controller
                  control={control}
                  name="categoryId"
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

              <TranslationStatusPanel
                hasCATitle={!!titleCA}
                hasENTitle={!!titleEN}
              />
            </div>
          </div>
        </main>
        <SaveConflictModal
          conflict={conflict}
          onClose={() => setConflict(null)}
          onReload={handleConflictReload}
          onCopyFailed={() =>
            setSubmissionError(
              'No s’ha pogut copiar automàticament. Selecciona el text de recuperació manualment.'
            )
          }
        />
      </form>
    </FormProvider>
  );
}
