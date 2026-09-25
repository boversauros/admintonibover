import { ReactNode } from 'react';
import { Link } from '@/components/ui';

interface AppHeaderProps {
  /** Left side. Defaults to the brand wordmark. */
  leading?: ReactNode;
  /** Right side: primary action, user menu. */
  actions?: ReactNode;
  /** Render the wordmark as the page h1 (list page). */
  brandAsHeading?: boolean;
}

// Mirrors the public site's navigation bar: fixed height, translucent black,
// hairline border, serif italic wordmark with a tracked sans label.
export function AppHeader({
  leading,
  actions,
  brandAsHeading = false,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-subtle bg-nav backdrop-blur-sm">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-6 px-6">
        {leading ?? <Brand as={brandAsHeading ? 'h1' : 'div'} />}
        {actions ? (
          <div className="flex items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

function Brand({ as: Element }: { as: 'h1' | 'div' }) {
  return (
    <Element className="shrink-0">
      <Link href="/" className="group flex items-baseline gap-4">
        <span className="whitespace-nowrap font-serif text-xl font-semibold italic text-primary transition-colors group-hover:text-secondary md:text-2xl">
          Toni Bover
        </span>
        <span
          aria-hidden="true"
          className="hidden h-5 self-center border-l border-subtle sm:inline-block"
        />
        <span className="hidden whitespace-nowrap text-sm uppercase tracking-widest text-muted sm:inline-block">
          Administració
        </span>
      </Link>
    </Element>
  );
}
