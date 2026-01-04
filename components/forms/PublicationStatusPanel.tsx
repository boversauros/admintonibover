'use client';

import { Toggle, StatusBadge } from '@/components/ui';

interface PublicationStatusPanelProps {
  isPublished: boolean;
  onToggle: (checked: boolean) => void;
}

export function PublicationStatusPanel({
  isPublished,
  onToggle,
}: PublicationStatusPanelProps) {
  return (
    <div className="p-4 bg-overlay-2 border border-default rounded">
      <h4 className="text-xs text-muted uppercase tracking-wider mb-3 font-medium">
        Estat de publicació
      </h4>
      <p className="text-sm text-body mb-4">
        Publica l'article o desa com a esborrany
      </p>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-secondary">Publicar</span>
        <Toggle checked={isPublished} onChange={onToggle} size="small" />
      </div>
      <div className="pt-3 border-t border-subtle">
        <p className="text-xs text-muted mb-2">Estat actual:</p>
        <StatusBadge published={isPublished} />
      </div>
    </div>
  );
}
