'use client';

import { Icon, Text, Button, Input } from '@/components/ui';

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
    <div className="flex items-center justify-between gap-4">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Text
          as="span"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10"
        >
          <Icon name="search" size="5" />
        </Text>
        <Input
          type="text"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Cerca articles..."
          size="sm"
          wrapperClassName="w-full"
          className="bg-transparent pl-12 pr-4"
        />
      </div>

      {/* Status Filter Buttons */}
      <div className="flex border border-default">
        {filterOptions.map(option => (
          <Button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            variant="ghost"
            size="sm"
            className={`px-4 py-2 text-sm transition-all-smooth ${
              filterStatus === option.value
                ? 'bg-overlay-10 text-primary'
                : 'text-muted hover:text-secondary hover:bg-overlay-5'
            }`}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
