'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  fieldControlClasses,
  fieldLabelClasses,
  fieldSizeClasses,
  type FieldSize,
} from './field';
import { Icon } from './Icon';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  size?: FieldSize;
  disabled?: boolean;
  wrapperClassName?: string;
  triggerClassName?: string;
  menuClassName?: string;
  ariaLabel?: string;
}

export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  label,
  placeholder,
  size = 'sm',
  disabled = false,
  wrapperClassName = '',
  triggerClassName = '',
  menuClassName = '',
  ariaLabel,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const triggerId = `dropdown-trigger-${reactId}`;
  const menuId = `dropdown-menu-${reactId}`;

  const selected = options.find(o => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? '';

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !menuRef.current) return;
    const item =
      menuRef.current.querySelectorAll<HTMLLIElement>('[role="option"]')[
        activeIndex
      ];
    item?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  const select = (next: T) => {
    onChange(next);
    setIsOpen(false);
    setActiveIndex(-1);
    triggerRef.current?.focus();
  };

  const openMenu = () => {
    const initial = options.findIndex(option => option.value === value);
    setActiveIndex(initial >= 0 ? initial : 0);
    setIsOpen(true);
  };

  const handleTriggerKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openMenu();
    }
  };

  const handleMenuKey = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(i => (i + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(i => (i - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (activeIndex >= 0) select(options[activeIndex].value);
    } else if (event.key === 'Tab') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const triggerClasses =
    `${fieldControlClasses(false)} inline-flex items-center justify-between gap-2 cursor-pointer ${
      fieldSizeClasses[size]
    } ${isOpen ? 'border-focus' : ''} ${triggerClassName}`.trim();

  return (
    <div className={`relative ${wrapperClassName}`} ref={wrapperRef}>
      {label && (
        <label htmlFor={triggerId} className={fieldLabelClasses}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (isOpen) {
            setIsOpen(false);
            setActiveIndex(-1);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKey}
        className={triggerClasses}
      >
        <span className={`truncate ${!selected ? 'text-muted' : ''}`}>
          {displayLabel}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-muted transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        >
          <Icon name="chevron-down" size="4" />
        </span>
      </button>

      {isOpen && (
        <ul
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-labelledby={triggerId}
          tabIndex={-1}
          onKeyDown={handleMenuKey}
          autoFocus
          className={`absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-auto border border-default bg-background animate-fade-in focus:outline-none ${menuClassName}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option.value)}
                className={`flex items-center gap-2 px-3.5 py-2 text-sm cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-overlay-10 text-primary'
                    : 'text-body hover:bg-overlay-5 hover:text-primary'
                } ${isSelected ? 'text-primary' : ''}`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">
                  {isSelected && <Icon name="check" size="4" />}
                </span>
                <span className="flex-1 truncate">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
