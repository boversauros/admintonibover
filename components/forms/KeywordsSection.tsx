import { Controller, useFormContext } from 'react-hook-form';
import { KeywordsInput } from './KeywordsInput';
import { Language } from '@/lib/types/post';

// Existing keywords for suggestions (would ideally come from database)
const existingKeywords = {
  ca: [
    'filosofia',
    'vida',
    'reflexió',
    'viatges',
    'natura',
    'muntanya',
    'cultura',
    'tradició',
    'història',
    'família',
    'records',
    'poesia',
    'art',
    'música',
    'mar',
    'mediterrani',
  ],
  en: [
    'philosophy',
    'life',
    'reflection',
    'travel',
    'nature',
    'mountain',
    'culture',
    'tradition',
    'history',
    'family',
    'memories',
    'poetry',
    'art',
    'music',
    'sea',
    'mediterranean',
  ],
};

interface KeywordsSectionProps {
  language: Language;
}

export function KeywordsSection({ language }: KeywordsSectionProps) {
  const { control } = useFormContext();

  const fieldName = `translations.${language}.keywords` as const;

  return (
    <Controller
      key={`keywords-${language}`}
      name={fieldName}
      control={control}
      render={({ field }) => (
        <KeywordsInput
          value={field.value || []}
          onChange={field.onChange}
          language={language}
          suggestions={existingKeywords[language]}
        />
      )}
    />
  );
}
