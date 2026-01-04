'use client';

import { Icon } from '@/components/ui';

export type FilterStatus = 'all' | 'published' | 'draft';

interface PostsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
}

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Tots' },
  { value: 'published', label: 'Publicats' },
  { value: 'draft', label: 'Esborranys' },
];

export function PostsFilters({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
}: PostsFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          <Icon name="search" size="5" />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Cerca articles..."
          className="w-full bg-transparent border border-default pl-12 pr-4 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-focus focus:glow transition-all-smooth"
        />
      </div>

      {/* Status Filter Buttons */}
      <div className="flex border border-default">
        {filterOptions.map(option => (
          <button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            className={`px-4 py-2 text-sm transition-all-smooth ${
              filterStatus === option.value
                ? 'bg-overlay-10 text-primary'
                : 'text-muted hover:text-secondary hover:bg-overlay-5'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
