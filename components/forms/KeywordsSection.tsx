import { Controller, useFormContext } from 'react-hook-form';
import { KeywordsInput } from './KeywordsInput';
import { Language } from '@/lib/types/post';
import { Text } from '@/components/ui';

interface KeywordsSectionProps {
  language: Language;
}

export function KeywordsSection({ language }: KeywordsSectionProps) {
  const { control } = useFormContext();

  const langLabel = language === 'ca' ? 'CA' : 'EN';
  const fieldName = `translations.${language}.keywords` as const;

  return (
    <div>
      <Controller
        key={`keywords-${language}`}
        name={fieldName}
        control={control}
        render={({ field }) => (
          <KeywordsInput
            label={`Keywords (${langLabel})`}
            value={field.value || []}
            onChange={field.onChange}
            placeholder="Type keyword and press Enter..."
          />
        )}
      />
      <Text as="p" variant="small" className="mt-1">
        Add keywords for SEO and categorization
      </Text>
    </div>
  );
}
