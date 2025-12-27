import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  isInvalid?: boolean;
  showCharCount?: boolean;
  maxChars?: number;
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
      bg-surface
      border
      ${isInvalid || error ? 'border-accent text-accent' : 'border-default'}
      text-primary
      placeholder:text-muted
      rounded
      resize-none
      focus:outline-none
      focus:border-primary
      hover:border-subtle
      disabled:opacity-50
      disabled:cursor-not-allowed
      transition-colors-default
      leading-relaxed
      ${sizeClasses[size]}
      ${className}
    `.trim().replace(/\s+/g, ' ');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm text-muted font-medium tracking-wide mb-2"
          >
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
            <p className={`text-sm ${error ? 'text-accent' : 'text-muted'}`}>
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
