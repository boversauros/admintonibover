import { ButtonHTMLAttributes } from 'react';

interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'default' | 'small';
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'default',
  className = '',
  ...rest
}: ToggleProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const isSmall = size === 'small';
  
  // Size-based classes
  const containerSizeClasses = isSmall
    ? 'h-5 w-9'
    : 'h-7 w-12';
  
  const ballSizeClasses = isSmall
    ? 'h-3.5 w-3.5'
    : 'h-5 w-5';
  
  const ballTranslateClasses = checked
    ? isSmall
      ? 'translate-x-4.5'
      : 'translate-x-6'
    : 'translate-x-1';

  // Ball color: use pale white when disabled, otherwise use normal colors
  const ballColorClasses = disabled
    ? 'bg-white/70 shadow-white/30'
    : checked
      ? 'bg-emerald-400 shadow-emerald-400/50'
      : 'bg-primary-80 shadow-black/20';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      disabled={disabled}
      className={`
        relative inline-flex ${containerSizeClasses} items-center rounded-full transition-all-smooth
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-overlay-50
        disabled:opacity-50 disabled:cursor-not-allowed
        ${
          checked
            ? 'bg-emerald-500/30 border border-emerald-500/50'
            : 'bg-overlay-10 border border-default'
        }
        ${disabled ? '' : 'cursor-pointer hover:scale-105 active:scale-95'}
        ${className}
      `
        .trim()
        .replace(/\s+/g, ' ')}
      {...rest}
    >
      <span
        className={`
          inline-block ${ballSizeClasses} transform rounded-full transition-all-smooth
          shadow-sm ${ballTranslateClasses} ${ballColorClasses}
        `
          .trim()
          .replace(/\s+/g, ' ')}
      />
    </button>
  );
}
