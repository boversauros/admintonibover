"use client";

import { useRouter } from "next/navigation";
import { Button, Icon } from "@/components/ui";

interface FormHeaderProps {
  isPublished: boolean;
  onPublishToggle: () => void;
  isSubmitting: boolean;
  isEditMode: boolean;
}

export function FormHeader({
  isPublished,
  onPublishToggle,
  isSubmitting,
  isEditMode,
}: FormHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-nav backdrop-blur-sm border-b border-default">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-muted hover:text-primary transition-colors"
        >
          <Icon name="chevron-left" size="5" />
          <span className="text-sm">Tornar</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Publish Toggle */}
          <button
            type="button"
            onClick={onPublishToggle}
            className={`px-4 py-2 text-sm border transition-all ${
              isPublished
                ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                : "border-default text-muted hover:border-subtle"
            }`}
          >
            {isPublished ? (
              <span className="flex items-center gap-2">
                <Icon name="check" size="4" /> Publicat
              </span>
            ) : (
              "Esborrany"
            )}
          </button>

          {/* Save Button */}
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isEditMode
                ? "Desant..."
                : "Creant..."
              : "Desar"}
          </Button>
        </div>
      </div>
    </header>
  );
}
