import { ReactNode, ElementType } from 'react';

type TextElement = 'p' | 'span' | 'div';
type TextVariant = 'body' | 'caption' | 'small' | 'muted' | 'label';

interface TextProps {
  as?: TextElement;
  variant?: TextVariant;
  italic?: boolean;
  serif?: boolean;
  className?: string;
  children: ReactNode;
}

export function Text({
  as: Element = 'p',
  variant = 'body',
  italic = false,
  serif = false,
  className = '',
  children,
}: TextProps) {
  const variantClasses: Record<TextVariant, string> = {
    body: 'text-base leading-relaxed text-body',
    caption: 'text-sm text-muted font-serif italic',
    small: 'text-sm text-muted',
    muted: 'text-muted',
    label: 'text-sm tracking-wider text-muted',
  };

  const italicClass = italic && variant !== 'caption' ? 'italic' : '';
  const serifClass = serif && variant !== 'caption' ? 'font-serif' : '';
  const finalClasses = `${variantClasses[variant]} ${italicClass} ${serifClass} ${className}`.trim();

  const TextElement = Element as ElementType;

  return <TextElement className={finalClasses}>{children}</TextElement>;
}
