import NextLink from 'next/link';
import { AnchorHTMLAttributes, ReactNode } from 'react';

interface LinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> {
  href: string;
  variant?: 'primary' | 'muted' | 'secondary' | 'accent-border';
  active?: boolean;
  children: ReactNode;
}

export function Link({
  href,
  variant = 'primary',
  active = false,
  className = '',
  children,
  ...rest
}: LinkProps) {
  const variantClasses = {
    primary: 'text-body hover:text-primary transition-colors-default',
    muted: 'text-muted hover:text-primary transition-colors-default',
    secondary: 'text-primary-60 hover:text-primary transition-colors-default',
    'accent-border':
      'text-muted border-b border-transparent hover:text-primary hover:border-primary transition-colors-default',
  };

  const activeClasses = active ? 'border-b-2 border-primary text-primary' : '';
  const finalClasses =
    `${variantClasses[variant]} ${activeClasses} ${className}`.trim();

  // Use Next.js Link for internal routes, regular anchor for external
  const isInternal = href.startsWith('/');

  if (isInternal) {
    return (
      <NextLink href={href} className={finalClasses} {...rest}>
        {children}
      </NextLink>
    );
  }

  const isExternalHttp = /^https?:\/\//i.test(href);
  const externalRel = isExternalHttp
    ? `noopener noreferrer${rest.rel ? ` ${rest.rel}` : ''}`
    : rest.rel;
  const externalTarget = isExternalHttp ? rest.target || '_blank' : rest.target;

  return (
    <a
      href={href}
      className={finalClasses}
      {...rest}
      rel={externalRel}
      target={externalTarget}
    >
      {children}
    </a>
  );
}
