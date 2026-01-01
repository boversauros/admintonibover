'use client';

import { useState, ReactNode } from 'react';
import { Icon } from '@/components/ui';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-default">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 flex items-center justify-between text-muted hover:text-primary transition-colors-default"
      >
        <span className="text-xs uppercase tracking-wider font-medium">
          {title}
        </span>
        <span
          className={`transform transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <Icon name="chevron-down" />
        </span>
      </button>
      {isOpen && <div className="pb-6 space-y-4">{children}</div>}
    </div>
  );
}
