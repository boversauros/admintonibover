'use client';

import { ReactNode, useEffect } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity-default"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          className={`
            bg-surface
            border
            border-default
            shadow-lg
            w-full
            ${sizeClasses[size]}
            overflow-hidden
          `
            .trim()
            .replace(/\s+/g, ' ')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
            <h2 id="modal-title" className="text-lg text-primary font-medium">
              {title}
            </h2>
            {showCloseButton && (
              <Button
                variant="icon"
                size="icon"
                onClick={onClose}
                aria-label="Close modal"
              >
                <Icon name="close" size="6" />
              </Button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto text-body">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-4 px-6 py-4 border-t border-subtle">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
