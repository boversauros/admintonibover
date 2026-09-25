import { Bodoni_Moda, Nunito } from 'next/font/google';

// Same families as the public site (tonibover). Exposed as CSS variables
// and consumed by --font-serif / --font-sans in styles/tokens.css.
export const bodoni = Bodoni_Moda({
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  variable: '--font-bodoni',
});

export const nunito = Nunito({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '600'],
  variable: '--font-nunito',
});
