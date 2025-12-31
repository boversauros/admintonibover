"use client";

interface TranslationStatusPanelProps {
  hasCATitle: boolean;
  hasENTitle: boolean;
}

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

export function TranslationStatusPanel({
  hasCATitle,
  hasENTitle,
}: TranslationStatusPanelProps) {
  return (
    <div className="p-4 bg-white/[0.02] border border-default">
      <h4 className="text-xs text-muted uppercase tracking-wider mb-3">
        Estat de traducció
      </h4>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">Català</span>
          {hasCATitle ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <CheckIcon /> Complet
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Pendent</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">English</span>
          {hasENTitle ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <CheckIcon /> Complet
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Pendent</span>
          )}
        </div>
      </div>
    </div>
  );
}
