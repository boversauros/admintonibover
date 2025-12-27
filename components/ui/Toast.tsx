'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
  onClose: () => void;
  id: string;
}

export function Toast({
  message,
  type = 'info',
  duration = 4000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeClasses = {
    info: 'border-l-accent',
    success: 'border-l-primary',
    error: 'border-l-accent',
    warning: 'border-l-accent',
  };

  const typeTextClasses = {
    info: 'text-primary',
    success: 'text-primary',
    error: 'text-accent',
    warning: 'text-accent',
  };

  const toastClasses = `
    fixed
    bottom-6
    right-6
    p-4
    bg-surface
    border-l-4
    ${typeClasses[type]}
    rounded-md
    shadow-lg
    z-50
    min-w-80
    max-w-md
    transition-opacity-default
    ${isVisible ? 'opacity-100' : 'opacity-0'}
  `.trim().replace(/\s+/g, ' ');

  return (
    <div className={toastClasses}>
      <div className="flex items-center justify-between gap-4">
        <p className={`text-sm ${typeTextClasses[type]} flex-1`}>{message}</p>
        <Button
          variant="icon"
          size="icon"
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          aria-label="Close notification"
        >
          <Icon name="close" size="6" />
        </Button>
      </div>
    </div>
  );
}
