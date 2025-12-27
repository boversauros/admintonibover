import { Language } from '@/lib/types/post';

interface LanguageTabsProps {
  active: Language;
  onChange: (language: Language) => void;
}

export function LanguageTabs({ active, onChange }: LanguageTabsProps) {
  const tabs: { value: Language; label: string }[] = [
    { value: 'ca', label: 'CA' },
    { value: 'en', label: 'EN' },
  ];

  return (
    <div className="flex gap-2 mb-6">
      {tabs.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          type="button"
          className={`
            px-6
            py-2
            rounded
            font-medium
            transition-colors-default
            ${active === tab.value
              ? 'bg-accent text-black'
              : 'bg-surface text-muted hover:text-primary hover:bg-hover-surface border border-default'
            }
          `.trim().replace(/\s+/g, ' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
