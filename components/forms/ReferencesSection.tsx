import { Controller, useFormContext } from 'react-hook-form';
import { ReferencesInput } from './ReferencesInput';
import { Language } from '@/lib/types/post';
import { Heading, Text } from '@/components/ui';

interface ReferencesSectionProps {
  language: Language;
}

export function ReferencesSection({ language }: ReferencesSectionProps) {
  const { control } = useFormContext();

  const langLabel = language === 'ca' ? 'CA' : 'EN';
  const fieldName = `translations.${language}.references` as const;

  return (
    <div>
      <Heading as="h3" size="xl" className="mb-3">References ({langLabel})</Heading>
      <Controller
        key={`references-${language}`}
        name={fieldName}
        control={control}
        render={({ field }) => (
          <ReferencesInput
            value={field.value || []}
            onChange={field.onChange}
          />
        )}
      />
      <Text as="p" variant="small" className="mt-1">
        Add citations, quotes, or image references
      </Text>
    </div>
  );
}
