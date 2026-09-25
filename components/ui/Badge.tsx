import { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  children: ReactNode;
}

// Status colors always follow the same recipe: solid text, /10 fill, /30 border.
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'text-muted border-default',
  success: 'text-success bg-success/10 border-success/30',
  warning: 'text-warning bg-warning/10 border-warning/30',
  danger: 'text-danger bg-danger/10 border-danger/30',
  info: 'text-info bg-info/10 border-info/30',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  tone = 'neutral',
  size = 'sm',
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const finalClasses =
    `inline-flex items-center gap-1.5 border uppercase tracking-wider ${toneClasses[tone]} ${sizeClasses[size]} ${className}`.trim();

  return (
    <span className={finalClasses} {...rest}>
      {children}
    </span>
  );
}
