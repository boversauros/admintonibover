'use client';

import { Icon } from './Icon';
import { Button } from './Button';
import { Text } from './Text';

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

  return (
    <nav
      className={`flex items-center justify-between ${className}`}
      aria-label="Pagination"
    >
      {/* Previous Button */}
      <Button
        onClick={() => !isFirstPage && onPageChange(currentPage - 1)}
        disabled={isFirstPage}
        variant="ghost"
        size="sm"
        className={isFirstPage ? 'text-overlay-30 cursor-not-allowed' : ''}
        aria-label="Pàgina anterior"
      >
        <Icon name="chevron-left" size="4" />
        <Text as="span" variant="small" className="ml-1">
          Anterior
        </Text>
      </Button>

      {/* Page indicator */}
      <Text as="span" variant="small" className="text-muted">
        {currentPage} / {totalPages}
      </Text>

      {/* Next Button */}
      <Button
        onClick={() => !isLastPage && onPageChange(currentPage + 1)}
        disabled={isLastPage}
        variant="ghost"
        size="sm"
        className={isLastPage ? 'text-overlay-30 cursor-not-allowed' : ''}
        aria-label="Pàgina següent"
      >
        <Text as="span" variant="small" className="mr-1">
          Següent
        </Text>
        <Icon name="chevron-right" size="4" />
      </Button>
    </nav>
  );
}
