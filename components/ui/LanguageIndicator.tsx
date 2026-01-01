interface LanguageIndicatorProps {
  hasCA: boolean;
  hasEN: boolean;
}

export function LanguageIndicator({ hasCA, hasEN }: LanguageIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 ${
          hasCA ? 'bg-white/10 text-white/80' : 'bg-white/5 text-white/30'
        }`}
      >
        CA
      </span>
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 ${
          hasEN ? 'bg-white/10 text-white/80' : 'bg-white/5 text-white/30'
        }`}
      >
        EN
      </span>
    </div>
  );
}
