import { HTMLAttributes, ReactNode } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'secondary' | 'error';
  size?: 'sm' | 'md';
  children: ReactNode;
}

export function Badge({
  variant = 'default',
  size = 'sm',
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const variantClasses = {
    default: 'text-muted border-subtle',
    accent: 'text-slate-400 border-slate-500/30',
    secondary: 'text-primary-80 border-subtle',
    error: 'text-red-400 border-red-500/30',
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-1.5 text-base',
  };

  const finalClasses = `inline-flex items-center bg-surface border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

  return (
    <span className={finalClasses} {...rest}>
      {children}
    </span>
  );
}
