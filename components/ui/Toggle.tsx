import { InputHTMLAttributes } from 'react';

interface ToggleProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'size'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'default' | 'small';
  wrapperClassName?: string;
  labelClassName?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'default',
  className = '',
  wrapperClassName = '',
  labelClassName = 'block text-xs text-muted uppercase tracking-wider mb-2 font-serif',
  ...rest
}: ToggleProps) {
  const isSmall = size === 'small';

  // Size-based classes
  const containerSizeClasses = isSmall ? 'h-5 w-9' : 'h-7 w-12';

  const ballSizeClasses = isSmall ? 'h-3.5 w-3.5' : 'h-5 w-5';

  const ballTranslateClasses = checked
    ? isSmall
      ? 'translate-x-4.5'
      : 'translate-x-6'
    : 'translate-x-1';

  // Ball color: use pale white when disabled, otherwise white in all states
  const ballColorClasses = disabled
    ? 'bg-white/70 shadow-white/30'
    : 'bg-white shadow-black/20';

  const toggleSwitch = (
    <label
      className={`
        relative inline-flex ${containerSizeClasses} items-center rounded-full transition-all-smooth
        ${
          checked
            ? 'bg-emerald-500/50 border border-default'
            : 'bg-overlay-10 border border-default'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
        ${className}
      `
        .trim()
        .replace(/\s+/g, ' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-overlay-50"
        {...rest}
      />
      <span
        className={`
          inline-block ${ballSizeClasses} transform rounded-full transition-all-smooth
          shadow-sm ${ballTranslateClasses} ${ballColorClasses}
        `
          .trim()
          .replace(/\s+/g, ' ')}
      />
    </label>
  );

  // If label is provided, wrap in a container with label on top
  if (label) {
    return (
      <div className={wrapperClassName}>
        <span className={labelClassName}>{label}</span>
        {toggleSwitch}
      </div>
    );
  }

  // Otherwise return just the toggle switch
  return toggleSwitch;
}
