'use client';

import { Icon } from './Icon';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = '',
}: PaginationProps) {
  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  const buttonClasses = (isDisabled: boolean) =>
    `inline-flex items-center justify-center h-9 px-4 text-sm transition-all-smooth focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-black focus-visible:ring-overlay-50 ${
      isDisabled
        ? 'text-overlay-30 cursor-not-allowed'
        : 'text-muted hover:text-primary hover:bg-overlay-5'
    }`;

  return (
    <nav
      className={`flex items-center justify-between ${className}`}
      aria-label="Pagination"
    >
      {/* Previous Button */}
      <button
        onClick={() => !isFirstPage && onPageChange(currentPage - 1)}
        disabled={isFirstPage}
        className={buttonClasses(isFirstPage)}
        aria-label="Pàgina anterior"
      >
        <Icon name="chevron-left" size="4" />
        <span className="ml-1">Anterior</span>
      </button>

      {/* Page indicator */}
      <span className="text-sm text-muted">
        {currentPage} / {totalPages}
      </span>

      {/* Next Button */}
      <button
        onClick={() => !isLastPage && onPageChange(currentPage + 1)}
        disabled={isLastPage}
        className={buttonClasses(isLastPage)}
        aria-label="Pàgina següent"
      >
        <span className="mr-1">Següent</span>
        <Icon name="chevron-right" size="4" />
      </button>
    </nav>
  );
}
