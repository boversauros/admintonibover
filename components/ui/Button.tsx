import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'icon';
  children: ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'sm',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const variantClasses = {
    ghost: 'px-4 py-2 tracking-wide text-body hover:bg-surface hover:text-primary transition-all duration-300',
    icon: 'p-2 hover:text-primary transition-colors-default',
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    icon: 'h-8 w-8',
  };

  const finalSize = variant === 'icon' ? 'icon' : size;
  const finalClasses = `${variantClasses[variant]} ${sizeClasses[finalSize]} ${className}`.trim();

  return (
    <button type={type} className={finalClasses} {...rest}>
      {children}
    </button>
  );
}
