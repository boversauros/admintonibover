interface LanguageIndicatorProps {
  hasCA: boolean;
  hasEN: boolean;
}

export function LanguageIndicator({ hasCA, hasEN }: LanguageIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 ${
          hasCA
            ? 'bg-overlay-10 text-primary-80'
            : 'bg-overlay-5 text-primary-30'
        }`}
      >
        CA
      </span>
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 ${
          hasEN
            ? 'bg-overlay-10 text-primary-80'
            : 'bg-overlay-5 text-primary-30'
        }`}
      >
        EN
      </span>
    </div>
  );
}
