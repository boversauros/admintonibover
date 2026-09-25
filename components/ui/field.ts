// Shared styling for form controls (Input, Textarea, Select, Dropdown) so
// every field has the same label, border, focus and message treatment.

export type FieldSize = 'sm' | 'md' | 'lg';

export const fieldLabelClasses =
  'block text-xs text-muted uppercase tracking-wider mb-2';

export const fieldSizeClasses: Record<FieldSize, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-4 py-2',
  lg: 'text-lg px-4 py-3',
};

export function fieldControlClasses(invalid: boolean) {
  return [
    'w-full bg-transparent border text-primary placeholder:text-subtle transition-colors',
    invalid ? 'border-danger' : 'border-default hover:border-strong',
    'focus:outline-none focus:border-focus',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' ');
}

export function fieldMessageClasses(isError: boolean) {
  return `text-sm ${isError ? 'text-danger' : 'text-muted'}`;
}
