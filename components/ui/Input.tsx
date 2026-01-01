import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  isInvalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      size = 'md',
      isInvalid = false,
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'text-sm px-3 py-1.5',
      md: 'text-base px-4 py-2',
      lg: 'text-lg px-4 py-3',
    };

    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const inputClasses = `
      w-full
      bg-surface
      border
      ${isInvalid || error ? 'border-red-400' : 'border-default'}
      text-primary
      placeholder:text-muted
      focus:outline-none
      focus:border-slate-500
      hover:border-subtle
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors-default
      ${sizeClasses[size]}
      ${className}
    `.trim().replace(/\s+/g, ' ');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm text-muted font-medium tracking-wide mb-2"
          >
            {label}
          </label>
        )}
        <input ref={ref} id={inputId} className={inputClasses} {...rest} />
        {(error || helperText) && (
          <p className={`text-sm mt-1 ${error ? 'text-red-400' : 'text-muted'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
