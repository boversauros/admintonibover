'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Language } from '@/lib/types/post';
import { Icon } from '@/components/ui';

interface KeywordsInputProps {
  value: string[];
  onChange: (keywords: string[]) => void;
  label?: string;
  placeholder?: string;
  language?: Language;
  suggestions?: string[];
}

export function KeywordsInput({
  value,
  onChange,
  label = 'Paraules clau',
  placeholder,
  language = 'ca',
  suggestions = [],
}: KeywordsInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const langLabel = language === 'ca' ? 'Català' : 'English';
  const defaultPlaceholder =
    value.length === 0
      ? language === 'ca'
        ? 'Escriu o selecciona paraules clau...'
        : 'Type or select keywords...'
      : language === 'ca'
        ? 'Afegeix més...'
        : 'Add more...';

  // Filter suggestions based on input and already selected keywords
  const filteredSuggestions = suggestions
    .filter(kw => !value.includes(kw))
    .filter(
      kw =>
        inputValue === '' || kw.toLowerCase().includes(inputValue.toLowerCase())
    )
    .slice(0, 12);

  const addKeyword = (keyword: string) => {
    const trimmed = keyword.trim();
    const lowercaseTrimmed = trimmed.toLowerCase();

    if (
      trimmed &&
      !value.map(k => k.toLowerCase()).includes(lowercaseTrimmed)
    ) {
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
      if (filteredSuggestions.length > 0 && inputValue) {
        addKeyword(filteredSuggestions[0]);
      } else if (inputValue) {
        addKeyword(inputValue);
      }
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <label
          htmlFor="keywords-input"
          className="font-serif block text-xs text-muted uppercase tracking-wider mb-2"
        >
          {label}
          <span className="text-subtle normal-case ml-1">({langLabel})</span>
        </label>
      )}

      <div className="border border-default focus-within:border-focus transition-colors">
        {/* Selected keywords */}
        {value.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {value.map((kw, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-overlay-5 border border-overlay-20 text-sm text-primary-80"
              >
                #{kw}
                <button
                  type="button"
                  onClick={() => handleRemove(kw)}
                  className="text-primary-40 hover:text-red-400 transition-colors"
                >
                  <Icon name="x" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="relative">
          <input
            ref={inputRef}
            id="keywords-input"
            aria-label="Paraules clau"
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            className="w-full bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none p-3"
          />
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="border-t border-default">
            <div className="p-2">
              <span className="text-[10px] text-muted uppercase tracking-wider px-2">
                Suggeriments
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto pb-2">
              <div className="flex flex-wrap gap-1.5 px-3">
                {filteredSuggestions.map((kw, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      addKeyword(kw);
                      inputRef.current?.focus();
                    }}
                    className="px-2.5 py-1 text-xs text-body bg-overlay-5 hover:bg-overlay-10 hover:text-primary transition-colors"
                  >
                    #{kw}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
