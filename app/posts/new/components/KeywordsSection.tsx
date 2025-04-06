import React from "react";
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
      <h2 className="text-xl font-serif mb-6">Paraules clau</h2>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <div key={index} className="relative group">
            <div className="bg-gray-800 py-1 px-3 rounded-full text-sm text-gray-300 group-hover:bg-gray-700 transition-colors">
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
              className="absolute -top-1 -right-1 bg-gray-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ transform: "scale(0.7)" }}
              title="Eliminar paraula clau"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onArrayAdd("keywords", "Nova paraula")}
          className="bg-gray-800 hover:bg-gray-700 py-1 px-3 rounded-full text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
        >
          <PlusCircle className="w-3 h-3" />
          <span>Afegir</span>
        </button>
      </div>
    </div>
  );
};
