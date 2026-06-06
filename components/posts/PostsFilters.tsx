'use client';

import { Icon, Text, Input, Dropdown } from '@/components/ui';

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

const statusOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Tots els estats' },
  { value: 'published', label: 'Publicats' },
  { value: 'draft', label: 'Esborranys' },
];

const categoryOptions: { value: FilterCategory; label: string }[] = [
  { value: 'all', label: 'Totes les categories' },
  { value: '1', label: 'Vivències' },
  { value: '2', label: 'Influències' },
  { value: '3', label: 'Perspectives' },
];

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
      <div className="relative flex-1 min-w-[16rem] max-w-md">
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
        <Dropdown
          options={categoryOptions}
          value={filterCategory}
          onChange={onCategoryChange}
          ariaLabel="Filtrar per categoria"
          wrapperClassName="w-52"
        />
        <Dropdown
          options={statusOptions}
          value={filterStatus}
          onChange={onFilterChange}
          ariaLabel="Filtrar per estat"
          wrapperClassName="w-48"
        />
      </div>
    </div>
  );
}
