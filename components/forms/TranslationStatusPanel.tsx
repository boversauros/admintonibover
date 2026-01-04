'use client';

import { Icon } from '@/components/ui';

interface TranslationStatusPanelProps {
  hasCATitle: boolean;
  hasENTitle: boolean;
}

export function TranslationStatusPanel({
  hasCATitle,
  hasENTitle,
}: TranslationStatusPanelProps) {
  return (
    <div className="p-4 bg-overlay-2 border border-default">
      <h4 className="text-xs text-muted uppercase tracking-wider mb-3">
        Estat de traducció
      </h4>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">Català</span>
          {hasCATitle ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <Icon name="check" size="4" /> Complet
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Pendent</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-secondary">English</span>
          {hasENTitle ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <Icon name="check" size="4" /> Complet
            </span>
          ) : (
            <span className="text-amber-400 text-xs">Pendent</span>
          )}
        </div>
      </div>
    </div>
  );
}
