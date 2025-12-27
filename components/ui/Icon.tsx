import { SVGAttributes } from 'react';

type IconName = 'menu' | 'close' | 'chevron-left' | 'chevron-right' | 'arrow-left' | 'arrow-right';
type IconSize = '4' | '5' | '6' | '8' | '10' | '12';
type IconVariant = 'outline' | 'solid';

interface IconProps extends Omit<SVGAttributes<SVGElement>, 'name'> {
  name: IconName;
  size?: IconSize;
  variant?: IconVariant;
  className?: string;
}

const icons = {
  'menu': {
    variant: 'outline' as const,
    viewBox: '0 0 24 24',
    path: 'M4 6h16M4 12h16M4 18h16',
  },
  'close': {
    variant: 'outline' as const,
    viewBox: '0 0 24 24',
    path: 'M6 18L18 6M6 6l12 12',
  },
  'chevron-left': {
    variant: 'outline' as const,
    viewBox: '0 0 24 24',
    path: 'M15 19l-7-7 7-7',
  },
  'chevron-right': {
    variant: 'outline' as const,
    viewBox: '0 0 24 24',
    path: 'M9 5l7 7-7 7',
  },
  'arrow-left': {
    variant: 'solid' as const,
    viewBox: '0 0 20 20',
    path: 'M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L4.414 9H17a1 1 0 110 2H4.414l5.293 5.293a1 1 0 010 1.414z',
  },
  'arrow-right': {
    variant: 'solid' as const,
    viewBox: '0 0 20 20',
    path: 'M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L15.586 11H3a1 1 0 110-2h12.586l-5.293-5.293a1 1 0 010-1.414z',
  },
};

export function Icon({
  name,
  size = '6',
  variant,
  className = '',
  'aria-hidden': ariaHidden = 'true',
  ...rest
}: IconProps) {
  const icon = icons[name];
  const finalVariant = variant || icon.variant;

  const sizeClasses = {
    '4': 'h-4 w-4',
    '5': 'h-5 w-5',
    '6': 'h-6 w-6',
    '8': 'h-8 w-8',
    '10': 'h-10 w-10',
    '12': 'h-12 w-12',
  };

  const finalClasses = `${sizeClasses[size]} ${className}`.trim();

  const svgAttrs = finalVariant === 'outline'
    ? {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
      }
    : {
        fill: 'currentColor',
      };

  const pathAttrs = finalVariant === 'outline'
    ? {
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      }
    : {
        fillRule: 'evenodd' as const,
        clipRule: 'evenodd' as const,
      };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={finalClasses}
      viewBox={icon.viewBox}
      aria-hidden={ariaHidden}
      {...svgAttrs}
      {...rest}
    >
      <path d={icon.path} {...pathAttrs} />
    </svg>
  );
}
