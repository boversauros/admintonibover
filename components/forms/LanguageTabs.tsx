'use client';

import { Language } from '@/lib/types/post';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';

interface LanguageTabsProps {
  active: Language;
  onChange: (language: Language) => void;
  hasCAContent?: boolean;
  hasENContent?: boolean;
}

interface LanguageTabProps {
  name: string;
  active: boolean;
  hasContent: boolean;
  onClick: () => void;
}

function LanguageTab({ name, active, hasContent, onClick }: LanguageTabProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      className={`relative px-6 py-3 text-sm transition ${
        active ? 'text-primary' : 'text-muted hover:text-secondary'
      }`}
    >
      <Text as="span" className="flex items-center gap-2">
        {name}
        {!hasContent && !active && (
          <span
            className="w-2 h-2 rounded-full bg-warning animate-pulse"
            title="No traduït"
            aria-label="No traduït"
          />
        )}
      </Text>
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-slide-in origin-left" />
      )}
    </Button>
  );
}

export function LanguageTabs({
  active,
  onChange,
  hasCAContent = true,
  hasENContent = true,
}: LanguageTabsProps) {
  return (
    <div className="border-b border-default mb-6">
      <div className="flex">
        <LanguageTab
          name="Català"
          active={active === 'ca'}
          hasContent={hasCAContent}
          onClick={() => onChange('ca')}
        />
        <LanguageTab
          name="English"
          active={active === 'en'}
          hasContent={hasENContent}
          onClick={() => onChange('en')}
        />
      </div>
    </div>
  );
}
