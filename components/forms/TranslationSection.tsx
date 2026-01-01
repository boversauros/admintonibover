import { useFormContext } from "react-hook-form";
import { Language } from "@/lib/types/post";

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
      <div className="space-y-2">
        <label className="block text-xs text-muted uppercase tracking-wider">
          Títol
        </label>
        <input
          key={`title-${language}`}
          type="text"
          {...register(titleField)}
          placeholder={titlePlaceholder}
          className={`w-full bg-transparent border px-4 py-3 font-serif text-lg text-primary placeholder:text-muted focus:outline-none focus:border-focus transition-colors ${
            titleError ? "border-red-400" : "border-default"
          }`}
        />
        {titleError && <p className="text-sm text-red-400">{titleError}</p>}
      </div>

      {/* Content Textarea */}
      <div className="space-y-2">
        <label className="block text-xs text-muted uppercase tracking-wider">
          Contingut
        </label>
        <textarea
          key={`content-${language}`}
          {...register(contentField)}
          placeholder={contentPlaceholder}
          rows={16}
          className={`w-full bg-transparent border px-4 py-3 text-body placeholder:text-muted focus:outline-none focus:border-focus transition-colors resize-none leading-relaxed ${
            contentError ? "border-red-400" : "border-default"
          }`}
        />
        {contentError && <p className="text-sm text-red-400">{contentError}</p>}
      </div>
    </div>
  );
}
