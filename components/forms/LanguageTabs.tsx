import { Language } from "@/lib/types/post";
import { Button } from "@/components/ui";

interface LanguageTabsProps {
  active: Language;
  onChange: (language: Language) => void;
}

export function LanguageTabs({ active, onChange }: LanguageTabsProps) {
  const tabs: { value: Language; label: string }[] = [
    { value: "ca", label: "CA" },
    { value: "en", label: "EN" },
  ];

  return (
    <div className="flex gap-2 mb-6">
      {tabs.map((tab) => {
        const isActive = active === tab.value;

        return (
          <Button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            className={
              isActive
                ? 'bg-accent text-black hover:bg-accent border-accent'
                : 'bg-surface text-muted'
            }
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
}
