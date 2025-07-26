import { PostReferences } from "../../../../types";
import { EditableField } from "./EditableField";
import { PlusCircle } from "lucide-react";

interface ReferencesSectionProps {
  references: PostReferences;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onAddReference: (type: 'images' | 'texts', value: string) => void;
  onRemoveReference: (type: 'images' | 'texts', value: string) => void;
  onUpdateReferences: (type: 'images' | 'texts', references: string[]) => void;
}

export const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  references,
  activeEditField,
  setActiveEditField,
  onAddReference,
  onRemoveReference,
  onUpdateReferences,
}) => {
  const handleAddReference = (type: 'images' | 'texts') => {
    // Add empty reference and immediately start editing it
    onAddReference(type, '');
    // Set focus to the new empty reference
    setActiveEditField(`${type}-${type === 'images' ? references.images.length : references.texts.length}`);
  };

  const handleUpdateReference = (type: 'images' | 'texts', index: number, value: string) => {
    if (value.trim() === '') {
      // Remove empty references
      const refToRemove = (type === 'images' ? references.images : references.texts)[index];
      if (refToRemove) {
        onRemoveReference(type, refToRemove);
      }
    } else {
      // Update the reference by creating a new array with the updated value
      const currentItems = [...(type === 'images' ? references.images : references.texts)];
      currentItems[index] = value.trim();
      
      // Use the callback to update the parent component's state
      if (onUpdateReferences) {
        onUpdateReferences(type, currentItems);
      } else {
        // Fallback to using add/remove if onUpdateReferences is not provided
        const oldValue = (type === 'images' ? references.images : references.texts)[index];
        if (oldValue) {
          onRemoveReference(type, oldValue);
        }
        onAddReference(type, value.trim());
      }
    }
  };

  const renderReferenceList = (type: 'images' | 'texts', items: string[]) => (
    <div>
      <h3 className="text-lg font-serif mb-3 text-gray-200">
        {type === 'images' ? 'Imatges' : 'Textos'}
      </h3>
      <div className="space-y-2">
        {items.map((item, index) => {
          const fieldName = `${type}-${index}`;
          return (
            <div key={index} className="group flex items-center gap-2">
              <div className="flex-1">
                <EditableField
                  value={item}
                  fieldName={fieldName}
                  className="text-gray-400 hover:text-white transition-colors text-sm bg-gray-800 px-3 py-1 rounded w-full"
                  activeEditField={activeEditField}
                  setActiveEditField={setActiveEditField}
                  onChange={(field, value) => handleUpdateReference(type, index, value)}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveReference(type, item)}
                className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity px-2"
                title={`Eliminar ${type === 'images' ? 'imatge' : 'text'}`}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => handleAddReference(type)}
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center mt-1"
        >
          <PlusCircle className="w-4 h-4 mr-1" />
          {`Afegir ${type === 'images' ? 'URL' : 'text'} de referència`}
        </button>
      </div>
    </div>
  );

  return (
    <div className="border-t border-gray-800 pt-8">
      <h2 className="text-xl font-serif mb-6">Referències</h2>
      <div className="space-y-8">
        {renderReferenceList('images', references.images)}
        {renderReferenceList('texts', references.texts)}
      </div>
    </div>
  );
};
