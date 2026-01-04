import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'size'
> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  isInvalid?: boolean;
  showCharCount?: boolean;
  maxChars?: number;
  wrapperClassName?: string;
  labelClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      size = 'md',
      isInvalid = false,
      showCharCount = false,
      maxChars,
      wrapperClassName = 'w-full',
      labelClassName = 'font-serif block text-xs text-muted uppercase tracking-wider mb-2',
      className = '',
      id,
      value,
      ...rest
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'text-sm px-3 py-2 min-h-20',
      md: 'text-base px-4 py-3 min-h-24',
      lg: 'text-lg px-4 py-4 min-h-32',
    };

    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const currentLength = typeof value === 'string' ? value.length : 0;

    const textareaClasses = `
      w-full
      bg-transparent
      border
      ${isInvalid || error ? 'border-red-400' : 'border-default'}
      text-primary
      placeholder:text-muted
      resize-none
      focus:outline-none
      focus:border-focus
      focus:glow
      hover:border-subtle
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-all-smooth
      leading-relaxed
      ${sizeClasses[size]}
      ${className}
    `
      .trim()
      .replace(/\s+/g, ' ');

    return (
      <div className={wrapperClassName}>
        {label && (
          <label htmlFor={textareaId} className={labelClassName}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={textareaClasses}
          value={value}
          maxLength={maxChars}
          {...rest}
        />
        {(error || helperText || showCharCount) && (
          <div className="flex justify-between items-center mt-1">
            <p className={`text-sm ${error ? 'text-red-400' : 'text-muted'}`}>
              {error || helperText || ''}
            </p>
            {showCharCount && maxChars && (
              <span className="text-sm text-muted">
                {currentLength} / {maxChars}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
