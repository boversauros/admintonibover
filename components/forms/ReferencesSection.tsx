import { Controller, useFormContext } from 'react-hook-form';
import { ReferencesInput } from './ReferencesInput';
import type { PostLanguage } from '@/lib/domain/posts/types';
import type { PostFormValues } from '@/lib/forms/postForm';

interface ReferencesSectionProps {
  language: PostLanguage;
}

export function ReferencesSection({ language }: ReferencesSectionProps) {
  const { control } = useFormContext<PostFormValues>();

  const fieldName = `translations.${language}.references` as const;

  return (
    <Controller
      key={`references-${language}`}
      name={fieldName}
      control={control}
      render={({ field }) => (
        <ReferencesInput value={field.value} onChange={field.onChange} />
      )}
    />
  );
}
