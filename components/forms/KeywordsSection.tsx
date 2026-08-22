import { Controller, useFormContext } from 'react-hook-form';
import { KeywordsInput } from './KeywordsInput';
import { Language } from '@/lib/types/post';

interface KeywordsSectionProps {
  language: Language;
  suggestions?: string[];
  isLoading?: boolean;
}

export function KeywordsSection({
  language,
  suggestions = [],
  isLoading = false,
}: KeywordsSectionProps) {
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
          suggestions={isLoading ? [] : suggestions}
        />
      )}
    />
  );
}
