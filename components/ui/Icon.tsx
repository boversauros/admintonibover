import { SVGAttributes, ReactNode } from 'react';

export type IconName =
  | 'menu'
  | 'close'
  | 'x'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-right-line'
  | 'edit'
  | 'trash'
  | 'plus'
  | 'check'
  | 'search'
  | 'image'
  | 'image-placeholder'
  | 'grip-vertical';

export type IconSize = '3' | '4' | '5' | '6' | '8' | '10' | '12';

interface IconProps extends Omit<SVGAttributes<SVGElement>, 'name'> {
  name: IconName;
  size?: IconSize;
  className?: string;
}

interface IconDefinition {
  viewBox: string;
  strokeWidth?: string;
  render: () => ReactNode;
}

const icons: Record<IconName, IconDefinition> = {
  'menu': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    render: () => <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'close': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    render: () => <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'x': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'chevron-left': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'chevron-right': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    render: () => <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'chevron-down': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'chevron-up': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'arrow-left': {
    viewBox: '0 0 20 20',
    render: () => (
      <path
        d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L4.414 9H17a1 1 0 110 2H4.414l5.293 5.293a1 1 0 010 1.414z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    ),
  },
  'arrow-right': {
    viewBox: '0 0 20 20',
    render: () => (
      <path
        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L15.586 11H3a1 1 0 110-2h12.586l-5.293-5.293a1 1 0 010-1.414z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    ),
  },
  'arrow-right-line': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    render: () => <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'edit': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => (
      <>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  'trash': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => (
      <>
        <polyline points="3,6 5,6 21,6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  'plus': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'check': {
    viewBox: '0 0 24 24',
    strokeWidth: '2',
    render: () => <polyline points="20,6 9,17 4,12" strokeLinecap="round" strokeLinejoin="round" />,
  },
  'search': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  'image': {
    viewBox: '0 0 24 24',
    strokeWidth: '1.5',
    render: () => (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </>
    ),
  },
  'image-placeholder': {
    viewBox: '0 0 24 24',
    strokeWidth: '1',
    render: () => (
      <>
        <rect x="3" y="3" width="18" height="18" rx="0" ry="0" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </>
    ),
  },
  'grip-vertical': {
    viewBox: '0 0 24 24',
    render: () => (
      <>
        <circle cx="9" cy="6" r="1.5" fill="currentColor" />
        <circle cx="15" cy="6" r="1.5" fill="currentColor" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <circle cx="9" cy="18" r="1.5" fill="currentColor" />
        <circle cx="15" cy="18" r="1.5" fill="currentColor" />
      </>
    ),
  },
};

const sizeClasses: Record<IconSize, string> = {
  '3': 'h-3 w-3',
  '4': 'h-4 w-4',
  '5': 'h-5 w-5',
  '6': 'h-6 w-6',
  '8': 'h-8 w-8',
  '10': 'h-10 w-10',
  '12': 'h-12 w-12',
};

export function Icon({
  name,
  size = '4',
  className = '',
  'aria-hidden': ariaHidden = 'true',
  ...rest
}: IconProps) {
  const icon = icons[name];

  if (!icon) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  const finalClasses = `${sizeClasses[size]} ${className}`.trim();

  // Determine if this is an outline or solid icon
  const isOutline = icon.strokeWidth !== undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={finalClasses}
      viewBox={icon.viewBox}
      aria-hidden={ariaHidden}
      fill={isOutline ? 'none' : 'currentColor'}
      stroke={isOutline ? 'currentColor' : 'none'}
      strokeWidth={icon.strokeWidth}
      {...rest}
    >
      {icon.render()}
    </svg>
  );
}
