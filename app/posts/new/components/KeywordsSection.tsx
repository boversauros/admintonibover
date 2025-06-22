import { PlusCircle, X } from "lucide-react";
import { EditableField } from "./EditableField";

interface KeywordsSectionProps {
  keywords: string[];
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onArrayAdd: (arrayPath: string, defaultValue: string) => void;
  onArrayRemove: (arrayPath: string, index: number) => void;
  onArrayUpdate: (arrayPath: string, index: number, value: string) => void;
}

export const KeywordsSection: React.FC<KeywordsSectionProps> = ({
  keywords,
  activeEditField,
  setActiveEditField,
  onArrayAdd,
  onArrayRemove,
  onArrayUpdate,
}) => {
  return (
    <div className="border-t border-gray-800 pt-8">
      <h3 className="text-lg font-serif mb-6 text-gray-200">Paraules Clau</h3>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <div key={index} className="relative group">
            <div className="text-gray-400 hover:text-white transition-colors text-sm">
              <EditableField
                value={keyword}
                fieldName={`keywords.${index}`}
                isArray={true}
                arrayPath="keywords"
                index={index}
                activeEditField={activeEditField}
                setActiveEditField={setActiveEditField}
                onChange={() => {}}
                onArrayUpdate={onArrayUpdate}
              />
            </div>
            <button
              onClick={() => onArrayRemove("keywords", index)}
              className="absolute -top-2 -right-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Eliminar paraula clau"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onArrayAdd("keywords", "Nova paraula")}
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1 group"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Afegir</span>
        </button>
      </div>
    </div>
  );
};
