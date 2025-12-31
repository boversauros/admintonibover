import { Controller, useFormContext } from "react-hook-form";
import { ReferencesInput } from "./ReferencesInput";
import { Language } from "@/lib/types/post";

interface ReferencesSectionProps {
  language: Language;
}

export function ReferencesSection({ language }: ReferencesSectionProps) {
  const { control } = useFormContext();

  const fieldName = `translations.${language}.references` as const;

  return (
    <Controller
      key={`references-${language}`}
      name={fieldName}
      control={control}
      render={({ field }) => (
        <ReferencesInput value={field.value || []} onChange={field.onChange} />
      )}
    />
  );
}
