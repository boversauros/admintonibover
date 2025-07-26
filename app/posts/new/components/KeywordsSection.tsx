import { PlusCircle, X } from "lucide-react";

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
    const newKeyword = prompt('Introdueix una nova paraula clau:');
    if (newKeyword) {
      onAddKeyword(newKeyword);
    }
  };

  const handleUpdateKeyword = (index: number, currentValue: string) => {
    const newValue = prompt('Edita la paraula clau:', currentValue);
    if (newValue !== null && newValue !== currentValue) {
      onUpdateKeyword(index, newValue);
    }
  };

  return (
    <div className="border-t border-gray-800 pt-8">
      <h3 className="text-lg font-serif mb-6 text-gray-200">Paraules Clau</h3>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <div key={index} className="relative group">
            <div 
              className="text-gray-400 hover:text-white transition-colors text-sm bg-gray-800 px-3 py-1 rounded cursor-pointer"
              onClick={() => handleUpdateKeyword(index, keyword)}
            >
              {keyword}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveKeyword(keyword);
              }}
              className="absolute -top-2 -right-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
              title="Eliminar paraula clau"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={handleAddKeyword}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Afegir paraula clau
        </button>
      </div>
    </div>
  );
};
