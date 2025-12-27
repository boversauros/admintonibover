import { ReactNode, ElementType } from 'react';

type Size = 'default' | 'wide' | 'full';
type Spacing = 'default' | 'compact' | 'loose' | 'none';

interface ContainerProps {
  as?: 'main' | 'div' | 'section' | 'article';
  size?: Size;
  spacing?: Spacing;
  className?: string;
  children: ReactNode;
}

export function Container({
  as: Wrapper = 'main',
  size = 'default',
  spacing = 'default',
  className = '',
  children,
}: ContainerProps) {
  const sizeClasses: Record<Size, string> = {
    default: 'max-w-4xl',
    wide: 'max-w-6xl',
    full: 'max-w-full',
  };

  const spacingClasses: Record<Spacing, string> = {
    default: 'pt-32 pb-16',
    compact: 'pt-16 pb-8',
    loose: 'pt-40 pb-24',
    none: '',
  };

  const wrapperClasses = `grow ${spacingClasses[spacing]}`.trim();
  const innerClasses = `${sizeClasses[size]} mx-auto px-6 ${className}`.trim();

  const WrapperElement = Wrapper as ElementType;

  return (
    <WrapperElement className={wrapperClasses}>
      <div className={innerClasses}>{children}</div>
    </WrapperElement>
  );
}
