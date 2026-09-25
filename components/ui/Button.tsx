import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center tracking-wide transition-colors disabled:opacity-50 disabled:pointer-events-none';

  const variantClasses = {
    primary:
      'border border-overlay-60 text-primary hover:bg-primary hover:text-background active:bg-secondary',
    secondary:
      'border border-strong text-primary/80 hover:border-overlay-60 hover:text-primary',
    ghost:
      'text-body hover:text-primary hover:bg-overlay-5 active:bg-overlay-10',
    destructive:
      'border border-danger/30 text-danger hover:bg-danger/10 active:bg-danger/20',
    icon: 'text-body hover:text-primary hover:bg-overlay-5 active:bg-overlay-10',
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-sm gap-2',
    md: 'h-10 px-4 text-base gap-2',
    lg: 'h-12 px-6 text-lg gap-3',
    icon: 'h-8 w-8 p-0',
  };

  const finalSize = variant === 'icon' ? 'icon' : size;
  const widthClass = fullWidth ? 'w-full' : '';
  const finalClasses =
    `${baseClasses} ${variantClasses[variant]} ${sizeClasses[finalSize]} ${widthClass} ${className}`.trim();

  return (
    <button
      type={type}
      className={finalClasses}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
