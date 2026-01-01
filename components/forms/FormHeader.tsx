"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface FormHeaderProps {
  isPublished: boolean;
  onPublishToggle: () => void;
  isSubmitting: boolean;
  isEditMode: boolean;
}

const ChevronLeftIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

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
          <ChevronLeftIcon />
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
                <CheckIcon /> Publicat
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
