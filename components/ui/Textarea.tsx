import { TextareaHTMLAttributes, forwardRef } from 'react';
import {
  fieldControlClasses,
  fieldLabelClasses,
  fieldMessageClasses,
  type FieldSize,
} from './field';

interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'size'
> {
  label?: string;
  error?: string;
  helperText?: string;
  size?: FieldSize;
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
      labelClassName = fieldLabelClasses,
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

    const textareaClasses =
      `${fieldControlClasses(isInvalid || Boolean(error))} resize-none leading-relaxed ${sizeClasses[size]} ${className}`.trim();

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
            <p className={fieldMessageClasses(Boolean(error))}>
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
