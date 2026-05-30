'use client';

import { Icon, Text, Button, Input } from '@/components/ui';

export type FilterStatus = 'all' | 'published' | 'draft';
export type FilterCategory = 'all' | '1' | '2' | '3';

interface PostsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  filterCategory: FilterCategory;
  onCategoryChange: (category: FilterCategory) => void;
}

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Tots' },
  { value: 'published', label: 'Publicats' },
  { value: 'draft', label: 'Esborranys' },
];

const categoryOptions: { value: FilterCategory; label: string }[] = [
  { value: 'all', label: 'Tots' },
  { value: '1', label: 'Vivències' },
  { value: '2', label: 'Influències' },
  { value: '3', label: 'Perspectives' },
];

function FilterButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex border border-default">
      {options.map(option => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          variant="ghost"
          size="sm"
          className={`px-4 py-2 text-sm transition-all-smooth ${
            value === option.value
              ? 'bg-overlay-10 text-primary'
              : 'text-muted hover:text-secondary hover:bg-overlay-5'
          }`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function PostsFilters({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  filterCategory,
  onCategoryChange,
}: PostsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
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

      <div className="flex flex-wrap items-center gap-3">
        <FilterButtonGroup
          options={categoryOptions}
          value={filterCategory}
          onChange={onCategoryChange}
        />
        <FilterButtonGroup
          options={filterOptions}
          value={filterStatus}
          onChange={onFilterChange}
        />
      </div>
    </div>
  );
}
