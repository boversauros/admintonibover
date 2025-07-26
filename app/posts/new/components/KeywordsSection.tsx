import { PlusCircle, X } from "lucide-react";
import { EditableField } from "./EditableField";

interface KeywordsSectionProps {
  keywords: string[];
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
  onUpdateKeyword: (index: number, value: string) => void;
}

export const KeywordsSection: React.FC<KeywordsSectionProps> = ({
  keywords,
  activeEditField,
  setActiveEditField,
  onAddKeyword,
  onRemoveKeyword,
  onUpdateKeyword,
}) => {
  const handleAddKeyword = () => {
    // Add empty keyword and immediately start editing it
    const newIndex = keywords.length;
    onAddKeyword(`Nova paraula clau ${newIndex > 0 ? `${newIndex}` : ""}`);
    // Set focus to the new empty keyword
    setActiveEditField(`keyword-${newIndex}`);
  };

  const handleUpdateKeyword = (index: number, value: string) => {
    if (value.trim() === "") {
      // Remove empty keywords
      onRemoveKeyword(keywords[index]);
    } else {
      onUpdateKeyword(index, value);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-serif text-gray-200">Paraules clau</h3>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <div key={index} className="relative group">
            <EditableField
              value={keyword}
              fieldName={`keyword-${index}`}
              isArray={true}
              index={index}
              arrayPath="keywords"
              className="text-sm px-3 py-1 text-gray-300"
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onChange={(field, value) => handleUpdateKeyword(index, value)}
              onArrayUpdate={(_, idx, value) => handleUpdateKeyword(idx, value)}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveKeyword(keyword);
              }}
              className="absolute -top-2 -right-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
              title="Eliminar paraula clau"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={handleAddKeyword}
          className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors text-sm cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Afegir paraula clau
        </button>
      </div>
    </div>
  );
};
