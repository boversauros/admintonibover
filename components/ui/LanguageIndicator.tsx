interface LanguageIndicatorProps {
  hasCA: boolean;
  hasEN: boolean;
}

export function LanguageIndicator({ hasCA, hasEN }: LanguageIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-2xs tracking-wider px-1.5 py-0.5 border ${
          hasCA ? 'border-strong text-primary' : 'border-subtle text-subtle'
        }`}
      >
        CA
      </span>
      <span
        className={`text-2xs tracking-wider px-1.5 py-0.5 border ${
          hasEN ? 'border-strong text-primary' : 'border-subtle text-subtle'
        }`}
      >
        EN
      </span>
    </div>
  );
}
