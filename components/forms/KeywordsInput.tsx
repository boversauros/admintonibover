import { useState, KeyboardEvent } from 'react';
import { Input, Badge, Button } from '@/components/ui';

interface KeywordsInputProps {
  value: string[];
  onChange: (keywords: string[]) => void;
  label?: string;
  placeholder?: string;
}

export function KeywordsInput({
  value,
  onChange,
  label = 'Keywords',
  placeholder = 'Add keyword...',
}: KeywordsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    const lowercaseTrimmed = trimmed.toLowerCase();

    if (trimmed && !value.map(k => k.toLowerCase()).includes(lowercaseTrimmed)) {
      onChange([...value, trimmed]);
      setInputValue('');
    }
  };

  const handleRemove = (keyword: string) => {
    onChange(value.filter(k => k !== keyword));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-muted font-medium tracking-wide mb-2">
          {label}
        </label>
      )}

      <div className="flex gap-2 mb-3">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <Button variant="ghost" onClick={handleAdd} type="button">
          Add
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {value.map((keyword, index) => (
            <Badge key={index} variant="default">
              <span className="mr-2">{keyword}</span>
              <button
                onClick={() => handleRemove(keyword)}
                className="text-primary hover:text-accent transition-colors-default"
                type="button"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
