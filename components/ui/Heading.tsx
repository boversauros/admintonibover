import { ReactNode, ElementType } from 'react';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type HeadingSize = 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
type HeadingVariant = 'primary' | 'secondary' | 'body' | 'muted';

interface HeadingProps {
  as?: HeadingLevel;
  size?: HeadingSize;
  variant?: HeadingVariant;
  italic?: boolean;
  className?: string;
  children: ReactNode;
}

export function Heading({
  as: Element = 'h2',
  size = '2xl',
  variant = 'primary',
  italic = false,
  className = '',
  children,
}: HeadingProps) {
  const sizeClasses: Record<HeadingSize, string> = {
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl md:text-5xl',
    '5xl': 'text-5xl',
  };

  const variantClasses: Record<HeadingVariant, string> = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    body: 'text-body',
    muted: 'text-muted',
  };

  const marginClasses: Record<HeadingSize, string> = {
    xl: 'mb-8',
    '2xl': 'mb-6',
    '3xl': 'mb-4',
    '4xl': 'mb-2',
    '5xl': 'mb-2',
  };

  const italicClass = italic ? 'italic' : '';
  const finalClasses = `font-serif ${sizeClasses[size]} ${variantClasses[variant]} ${marginClasses[size]} ${italicClass} ${className}`.trim();

  const HeadingElement = Element as ElementType;

  return <HeadingElement className={finalClasses}>{children}</HeadingElement>;
}
