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
      <Toggle
        checked={isPublished}
        onChange={onToggle}
        size="small"
        label="Publicar"
      />
      <div className="pt-3 border-t border-subtle">
        <StatusBadge published={isPublished} />
      </div>
    </div>
  );
}
