import { Controller, useFormContext } from 'react-hook-form';
import { ReferencesInput } from './ReferencesInput';
import { Language } from '@/lib/types/post';

interface ReferencesSectionProps {
  language: Language;
}

export function ReferencesSection({ language }: ReferencesSectionProps) {
  const { control } = useFormContext();

  const langLabel = language === 'ca' ? 'CA' : 'EN';
  const fieldName = `translations.${language}.references` as const;

  return (
    <div>
      <h3 className="text-lg font-medium mb-3">References ({langLabel})</h3>
      <Controller
        name={fieldName}
        control={control}
        render={({ field }) => (
          <ReferencesInput
            value={field.value || []}
            onChange={field.onChange}
          />
        )}
      />
      <p className="text-xs text-muted mt-1">
        Add citations, quotes, or image references
      </p>
    </div>
  );
}
