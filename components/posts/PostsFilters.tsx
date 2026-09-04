'use client';

import { Icon, Text, Input, Dropdown } from '@/components/ui';
import type { ImageInventoryStatus } from '@/lib/domain/media/contracts';

export type FilterStatus = 'all' | 'published' | 'draft';
export type FilterCategory = string;
export type FilterImageStatus = ImageInventoryStatus | 'all';
export type SortDirection = 'desc' | 'asc';

export type CategoryFilterOption = {
  value: string;
  label: string;
};

interface PostsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  filterCategory: FilterCategory;
  onCategoryChange: (category: FilterCategory) => void;
  filterImageStatus: FilterImageStatus;
  onImageStatusChange: (status: FilterImageStatus) => void;
  sortDirection: SortDirection;
  onSortChange: (dir: SortDirection) => void;
  categories?: CategoryFilterOption[];
}

const statusOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Tots els estats' },
  { value: 'published', label: 'Publicats' },
  { value: 'draft', label: 'Esborranys' },
];

const sortOptions: { value: SortDirection; label: string }[] = [
  { value: 'desc', label: 'Ordre descendent' },
  { value: 'asc', label: 'Ordre ascendent' },
];

const imageStatusOptions: { value: FilterImageStatus; label: string }[] = [
  { value: 'all', label: 'Totes les imatges' },
  { value: 'complete', label: 'Imatges completes' },
  { value: 'missing-main', label: 'Falta la destacada' },
  { value: 'missing-thumbnail', label: 'Falta la miniatura' },
  { value: 'missing-both', label: 'Falten totes dues' },
];

export function PostsFilters({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterChange,
  filterCategory,
  onCategoryChange,
  filterImageStatus,
  onImageStatusChange,
  sortDirection,
  onSortChange,
  categories = [],
}: PostsFiltersProps) {
  const categoryOptions: CategoryFilterOption[] = [
    { value: 'all', label: 'Totes les categories' },
    ...categories,
  ];
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
          aria-label="Cerca articles"
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
        <Dropdown
          options={imageStatusOptions}
          value={filterImageStatus}
          onChange={onImageStatusChange}
          ariaLabel="Filtrar per estat de les imatges"
          wrapperClassName="w-52"
        />
        <Dropdown
          options={sortOptions}
          value={sortDirection}
          onChange={onSortChange}
          ariaLabel="Ordenar articles"
          wrapperClassName="w-48"
        />
      </div>
    </div>
  );
}
