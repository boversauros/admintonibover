import { InputHTMLAttributes, forwardRef } from 'react';
import {
  fieldControlClasses,
  fieldLabelClasses,
  fieldMessageClasses,
  fieldSizeClasses,
  type FieldSize,
} from './field';

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: FieldSize;
  isInvalid?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      size = 'md',
      isInvalid = false,
      wrapperClassName = 'w-full',
      labelClassName = fieldLabelClasses,
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const inputClasses =
      `${fieldControlClasses(isInvalid || Boolean(error))} ${fieldSizeClasses[size]} ${className}`.trim();

    return (
      <div className={wrapperClassName}>
        {label && (
          <label htmlFor={inputId} className={labelClassName}>
            {label}
          </label>
        )}
        <input ref={ref} id={inputId} className={inputClasses} {...rest} />
        {(error || helperText) && (
          <p className={`mt-1 ${fieldMessageClasses(Boolean(error))}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
