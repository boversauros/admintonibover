import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface DatePickerProps {
  label?: string;
  value: string; // ISO date string (YYYY-MM-DD)
  onChange: (date: string) => void;
  error?: string;
  helperText?: string;
}

export function DatePicker({
  label,
  value,
  onChange,
  error,
  helperText,
}: DatePickerProps) {
  const dateValue = value ? new Date(value) : null;

  const handleChange = (date: Date | null) => {
    if (date) {
      onChange(date.toISOString().split('T')[0]);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-muted font-medium tracking-wide mb-2">
          {label}
        </label>
      )}
      <ReactDatePicker
        selected={dateValue}
        onChange={handleChange}
        dateFormat="yyyy-MM-dd"
        className={`
          w-full
          bg-surface
          border
          ${error ? 'border-accent text-accent' : 'border-default'}
          text-primary
          placeholder:text-muted
          rounded
          px-4
          py-2
          focus:outline-none
          focus:border-primary
          hover:border-subtle
          transition-colors-default
        `.trim().replace(/\s+/g, ' ')}
      />
      {(error || helperText) && (
        <p className={`text-sm mt-1 ${error ? 'text-accent' : 'text-muted'}`}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}
