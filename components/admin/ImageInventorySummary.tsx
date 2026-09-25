'use client';

import { Button, Text } from '@/components/ui';
import type {
  ImageInventoryCounts,
  ImageInventoryStatus,
} from '@/lib/domain/media/contracts';

const INVENTORY_LABELS: Record<ImageInventoryStatus, string> = {
  complete: 'Completes',
  'missing-main': 'Falta destacada',
  'missing-thumbnail': 'Falta miniatura',
  'missing-both': 'Falten totes dues',
};

const INVENTORY_DESCRIPTIONS: Record<ImageInventoryStatus, string> = {
  complete: 'Les dues imatges disponibles',
  'missing-main': 'Miniatura disponible',
  'missing-thumbnail': 'Destacada disponible',
  'missing-both': 'Cap imatge disponible',
};

interface ImageInventorySummaryProps {
  counts: ImageInventoryCounts | null;
  error: string | null;
  onRetry: () => void;
  onSelect: (status: ImageInventoryStatus | 'all') => void;
  selected: ImageInventoryStatus | 'all';
}

export function ImageInventorySummary({
  counts,
  error,
  onRetry,
  onSelect,
  selected,
}: ImageInventorySummaryProps) {
  if (error) {
    return (
      <section
        aria-labelledby="image-inventory-title"
        className="border border-warning/30 bg-warning/5 p-4"
      >
        <h2
          id="image-inventory-title"
          className="font-serif text-lg text-primary"
        >
          Estat de les imatges
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-body" role="alert">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Reintenta el recompte
          </Button>
        </div>
      </section>
    );
  }

  const statuses = Object.keys(INVENTORY_LABELS) as ImageInventoryStatus[];
  const total = counts
    ? statuses.reduce((sum, status) => sum + counts[status], 0)
    : 0;
  const repaired = counts?.complete ?? 0;

  return (
    <section
      aria-labelledby="image-inventory-title"
      aria-busy={!counts}
      className="border border-default p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-widest text-info">
            Inventari global
          </p>
          <h2
            id="image-inventory-title"
            className="mt-1 font-serif text-xl text-primary"
          >
            Reparació d’imatges
          </h2>
          <Text variant="small" className="mt-1 text-subtle">
            {counts
              ? `${repaired} de ${total} articles tenen les dues imatges.`
              : 'Calculant tots els articles…'}
          </Text>
        </div>
        {selected !== 'all' ? (
          <Button variant="ghost" size="sm" onClick={() => onSelect('all')}>
            Mostra tots els articles
          </Button>
        ) : null}
      </div>

      <progress
        className="mt-4 h-1.5 w-full accent-success"
        max={Math.max(total, 1)}
        value={repaired}
        aria-label="Articles amb les dues imatges disponibles"
      />

      <div
        className="mt-4 grid grid-cols-2 gap-px border border-default bg-overlay-10 lg:grid-cols-4"
        role="group"
        aria-label="Filtra els articles per estat de les imatges"
      >
        {statuses.map(status => {
          const isSelected = selected === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isSelected}
              disabled={!counts}
              onClick={() => onSelect(isSelected ? 'all' : status)}
              className={`min-h-28 p-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
                isSelected ? 'bg-info/10' : 'bg-background hover:bg-overlay-5'
              }`}
            >
              <span
                className={`block font-mono text-2xl tabular-nums ${
                  status === 'complete' ? 'text-success' : 'text-warning'
                }`}
              >
                {counts ? counts[status] : '—'}
              </span>
              <span className="mt-2 block text-xs uppercase tracking-wider text-primary">
                {INVENTORY_LABELS[status]}
              </span>
              <span className="mt-1 block text-xs text-subtle">
                {INVENTORY_DESCRIPTIONS[status]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
