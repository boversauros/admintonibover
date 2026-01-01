import { useFormContext } from "react-hook-form";
import { Language } from "@/lib/types/post";
import { Input, Textarea } from "@/components/ui";

interface TranslationSectionProps {
  language: Language;
}

export function TranslationSection({ language }: TranslationSectionProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const titleField = `translations.${language}.title` as const;
  const contentField = `translations.${language}.content` as const;

  // Safely extract error messages
  const translationErrors = errors.translations as any;
  const titleError = translationErrors?.[language]?.title?.message as
    | string
    | undefined;
  const contentError = translationErrors?.[language]?.content?.message as
    | string
    | undefined;

  const titlePlaceholder =
    language === "ca"
      ? "Escriu el títol de l'article..."
      : "Write the article title...";
  const contentPlaceholder =
    language === "ca"
      ? "Comença a escriure el contingut..."
      : "Start writing the content...";

  return (
    <div className="space-y-6">
      {/* Title Input */}
      <Input
        key={`title-${language}`}
        label="Títol"
        placeholder={titlePlaceholder}
        error={titleError}
        size="lg"
        className="bg-transparent font-serif"
        {...register(titleField)}
      />

      {/* Content Textarea */}
      <Textarea
        key={`content-${language}`}
        label="Contingut"
        placeholder={contentPlaceholder}
        error={contentError}
        size="md"
        rows={16}
        className="bg-transparent min-h-96"
        {...register(contentField)}
      />
    </div>
  );
}
