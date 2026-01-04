import { Controller, useFormContext } from 'react-hook-form';
import { KeywordsInput } from './KeywordsInput';
import { Language } from '@/lib/types/post';
import { useKeywords } from '@/lib/hooks/useKeywords';

interface KeywordsSectionProps {
  language: Language;
}

export function KeywordsSection({ language }: KeywordsSectionProps) {
  const { control } = useFormContext();
  const { keywords, isLoading } = useKeywords();

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
          suggestions={isLoading ? [] : keywords[language]}
        />
      )}
    />
  );
}
