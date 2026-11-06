import { Controller, useFormContext } from 'react-hook-form';
import { KeywordsInput } from './KeywordsInput';
import type { PostLanguage } from '@/lib/domain/posts/types';
import type { PostFormValues } from '@/lib/forms/postForm';

interface KeywordsSectionProps {
  language: PostLanguage;
  suggestions?: string[];
  isLoading?: boolean;
}

export function KeywordsSection({
  language,
  suggestions = [],
  isLoading = false,
}: KeywordsSectionProps) {
  const { control } = useFormContext<PostFormValues>();

  const fieldName = `translations.${language}.keywords` as const;

  return (
    <Controller
      key={`keywords-${language}`}
      name={fieldName}
      control={control}
      render={({ field }) => (
        <KeywordsInput
          value={field.value}
          onChange={field.onChange}
          language={language}
          suggestions={isLoading ? [] : suggestions}
        />
      )}
    />
  );
}
