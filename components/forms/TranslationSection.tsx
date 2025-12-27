import { useFormContext } from 'react-hook-form';
import { Input, Textarea } from '@/components/ui';
import { Language } from '@/lib/types/post';

interface TranslationSectionProps {
  language: Language;
}

export function TranslationSection({ language }: TranslationSectionProps) {
  const { register, formState: { errors } } = useFormContext();

  const langLabel = language === 'ca' ? 'Catalan' : 'English';
  const titleField = `translations.${language}.title` as const;
  const slugField = `translations.${language}.slug` as const;
  const contentField = `translations.${language}.content` as const;

  // Safely extract error messages
  const translationErrors = errors.translations as any;
  const titleError = translationErrors?.[language]?.title?.message as string | undefined;
  const slugError = translationErrors?.[language]?.slug?.message as string | undefined;
  const contentError = translationErrors?.[language]?.content?.message as string | undefined;

  return (
    <div className="space-y-4">
      <Input
        label={`Title (${langLabel})`}
        {...register(titleField)}
        placeholder={`Enter ${langLabel.toLowerCase()} title...`}
        error={titleError}
      />

      <Input
        label={`Slug (${langLabel})`}
        {...register(slugField)}
        placeholder="Auto-generated from title (editable)"
        helperText="URL-friendly version of the title"
        error={slugError}
      />

      <Textarea
        label={`Content (${langLabel})`}
        {...register(contentField)}
        placeholder={`Enter ${langLabel.toLowerCase()} content in markdown...`}
        error={contentError}
        showCharCount
        maxChars={5000}
      />
    </div>
  );
}
