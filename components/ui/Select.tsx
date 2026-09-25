import { SelectHTMLAttributes, forwardRef } from 'react';
import {
  fieldControlClasses,
  fieldLabelClasses,
  fieldMessageClasses,
  fieldSizeClasses,
  type FieldSize,
} from './field';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  group: string;
  items: SelectOption[];
}

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size'
> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: FieldSize;
  isInvalid?: boolean;
  options: SelectOption[] | SelectGroup[];
  placeholder?: string;
  wrapperClassName?: string;
}

function isSelectGroup(
  options: SelectOption[] | SelectGroup[]
): options is SelectGroup[] {
  return options.length > 0 && 'group' in options[0] && 'items' in options[0];
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
      wrapperClassName = 'w-full',
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const chevronPaddingClasses: Record<FieldSize, string> = {
      sm: 'pr-8',
      md: 'pr-10',
      lg: 'pr-12',
    };

    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const selectClasses =
      `${fieldControlClasses(isInvalid || Boolean(error))} appearance-none cursor-pointer ${fieldSizeClasses[size]} ${chevronPaddingClasses[size]} ${className}`.trim();

    return (
      <div className={wrapperClassName}>
        {label && (
          <label htmlFor={selectId} className={fieldLabelClasses}>
            {label}
          </label>
        )}
        <div className="relative w-full">
          <select ref={ref} id={selectId} className={selectClasses} {...rest}>
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {isSelectGroup(options)
              ? options.map(group => (
                  <optgroup key={group.group} label={group.group}>
                    {group.items.map(option => (
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
              : options.map(option => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
          </select>
          <Icon
            name="chevron-down"
            size="4"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>
        {(error || helperText) && (
          <p className={`mt-1 ${fieldMessageClasses(Boolean(error))}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
