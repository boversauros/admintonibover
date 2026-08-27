import type { FieldError, FieldErrors, Resolver } from 'react-hook-form';

import type { Language, PostFormData, PostTranslation } from '@/lib/types/post';

export const POST_LIMITS = {
  title: 200,
  content: 50000,
  keyword: 60,
  referenceUrl: 2048,
  referenceText: 2000,
  blockquote: 2000,
  author: 120,
} as const;

type TranslationFieldErrors = {
  title?: FieldError;
  content?: FieldError;
};

export type PostFormValidationContext = {
  requireCompleteTranslations: boolean;
};

const LANGUAGE_LABELS: Record<Language, string> = {
  ca: 'català',
  en: 'anglès',
};

function fieldError(type: string, message: string): FieldError {
  return { type, message };
}

function validateTranslation(
  language: Language,
  translation: PostTranslation
): TranslationFieldErrors {
  const errors: TranslationFieldErrors = {};
  const languageLabel = LANGUAGE_LABELS[language];

  if (translation.title.trim().length === 0) {
    errors.title = fieldError(
      'required',
      `Cal introduir el títol en ${languageLabel}.`
    );
  } else if (translation.title.length > POST_LIMITS.title) {
    errors.title = fieldError(
      'maxLength',
      `El títol en ${languageLabel} no pot superar els ${POST_LIMITS.title} caràcters.`
    );
  }

  if (translation.content.trim().length === 0) {
    errors.content = fieldError(
      'required',
      `Cal introduir el contingut en ${languageLabel}.`
    );
  } else if (translation.content.length > POST_LIMITS.content) {
    errors.content = fieldError(
      'maxLength',
      `El contingut en ${languageLabel} no pot superar els ${POST_LIMITS.content} caràcters.`
    );
  }

  return errors;
}

export function validatePostForm(
  values: PostFormData,
  context: PostFormValidationContext
): FieldErrors<PostFormData> {
  const errors: FieldErrors<PostFormData> = {};

  if (values.category_id.length === 0) {
    errors.category_id = fieldError('required', 'Selecciona una categoria.');
  }

  if (context.requireCompleteTranslations) {
    const caErrors = validateTranslation('ca', values.translations.ca);
    const enErrors = validateTranslation('en', values.translations.en);
    if (Object.keys(caErrors).length > 0 || Object.keys(enErrors).length > 0) {
      errors.translations = {
        ...(Object.keys(caErrors).length > 0 ? { ca: caErrors } : {}),
        ...(Object.keys(enErrors).length > 0 ? { en: enErrors } : {}),
      };
    }
  }

  return errors;
}

export const postFormResolver: Resolver<
  PostFormData,
  PostFormValidationContext
> = async (values, context) => {
  const errors = validatePostForm(values, {
    requireCompleteTranslations: context?.requireCompleteTranslations === true,
  });
  return Object.keys(errors).length > 0
    ? { values: {}, errors }
    : { values, errors: {} };
};
