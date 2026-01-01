"use client";

export type FilterStatus = "all" | "published" | "draft";

interface PostsFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
}

const SearchIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Tots" },
  { value: "published", label: "Publicats" },
  { value: "draft", label: "Esborranys" },
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
          <SearchIcon />
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cerca articles..."
          className="w-full bg-transparent border border-default pl-12 pr-4 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-slate-500 transition-colors"
        />
      </div>

      {/* Status Filter Buttons */}
      <div className="flex border border-default">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            className={`px-4 py-2 text-sm transition-colors ${
              filterStatus === option.value
                ? "bg-white/10 text-primary"
                : "text-muted hover:text-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
