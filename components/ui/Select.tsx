import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  group: string;
  items: SelectOption[];
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  isInvalid?: boolean;
  options: SelectOption[] | SelectGroup[];
  placeholder?: string;
}

function isSelectGroup(
  options: SelectOption[] | SelectGroup[]
): options is SelectGroup[] {
  return (
    options.length > 0 &&
    'group' in options[0] &&
    'items' in options[0]
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      size = 'md',
      isInvalid = false,
      options,
      placeholder,
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'text-sm px-3 py-1.5 pr-8',
      md: 'text-base px-4 py-2 pr-10',
      lg: 'text-lg px-4 py-3 pr-12',
    };

    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const selectClasses = `
      w-full
      bg-surface
      border
      ${isInvalid || error ? 'border-red-400' : 'border-default'}
      text-primary
      appearance-none
      cursor-pointer
      focus:outline-none
      focus:border-slate-500
      hover:border-subtle
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors-default
      ${sizeClasses[size]}
      ${className}
    `.trim().replace(/\s+/g, ' ');

    const chevronSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E`;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm text-muted font-medium tracking-wide mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={selectClasses}
            style={{
              backgroundImage: `url("${chevronSvg}")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1.25rem',
              backgroundRepeat: 'no-repeat',
            }}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {isSelectGroup(options)
              ? options.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.items.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              : options.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
          </select>
        </div>
        {(error || helperText) && (
          <p className={`text-sm mt-1 ${error ? 'text-red-400' : 'text-muted'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
