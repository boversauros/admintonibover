"use client";

import { Language } from "@/lib/types/post";

interface LanguageTabsProps {
  active: Language;
  onChange: (language: Language) => void;
  hasCAContent?: boolean;
  hasENContent?: boolean;
}

interface LanguageTabProps {
  code: Language;
  name: string;
  active: boolean;
  hasContent: boolean;
  onClick: () => void;
}

function LanguageTab({
  code,
  name,
  active,
  hasContent,
  onClick,
}: LanguageTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 ${
        active ? "text-primary" : "text-muted hover:text-secondary"
      }`}
    >
      <span className="flex items-center gap-2">
        {name}
        {!hasContent && !active && (
          <span
            className="w-2 h-2 rounded-full bg-amber-500/50"
            title="No traduït"
          />
        )}
      </span>
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
      )}
    </button>
  );
}

export function LanguageTabs({
  active,
  onChange,
  hasCAContent = true,
  hasENContent = true,
}: LanguageTabsProps) {
  return (
    <div className="border-b border-default mb-6">
      <div className="flex">
        <LanguageTab
          code="ca"
          name="Català"
          active={active === "ca"}
          hasContent={hasCAContent}
          onClick={() => onChange("ca")}
        />
        <LanguageTab
          code="en"
          name="English"
          active={active === "en"}
          hasContent={hasENContent}
          onClick={() => onChange("en")}
        />
      </div>
    </div>
  );
}
