import { PostReferences } from "../../../../types";
import { EditableField } from "./EditableField";

interface ReferencesSectionProps {
  references: PostReferences;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onAddReference: (type: 'images' | 'texts', value: string) => void;
  onRemoveReference: (type: 'images' | 'texts', value: string) => void;
}

export const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  references,
  activeEditField,
  setActiveEditField,
  onAddReference,
  onRemoveReference,
}) => {
  const handleAddReference = (type: 'images' | 'texts') => {
    const fieldName = `new-${type}-reference`;
    setActiveEditField(fieldName);
  };

  const handleSaveReference = (type: 'images' | 'texts', value: string) => {
    if (value.trim()) {
      onAddReference(type, value.trim());
    }
    setActiveEditField(null);
  };

  return (
    <div className="border-t border-gray-800 pt-8">
      <h2 className="text-xl font-serif mb-6">Referències</h2>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-serif mb-3 text-gray-200">Imatges</h3>
          <div className="space-y-2">
            {references.images.map((image, index) => (
              <div key={index} className="group flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="truncate">{image}</span>
                <button
                  type="button"
                  onClick={() => onRemoveReference('images', image)}
                  className="ml-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar referència"
                >
                  ×
                </button>
              </div>
            ))}
            {activeEditField === 'new-images-reference' ? (
              <div className="flex items-center">
                <input
                  type="text"
                  autoFocus
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Introdueix la URL de la imatge"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveReference('images', e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      setActiveEditField(null);
                    }
                  }}
                  onBlur={(e) => handleSaveReference('images', e.target.value)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleAddReference('images')}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
              >
                + Afegir URL d'imatge
              </button>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-serif mb-3 text-gray-200">Textos</h3>
          <div className="space-y-2">
            {references.texts.map((text, index) => (
              <div key={index} className="group flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="truncate">{text}</span>
                <button
                  type="button"
                  onClick={() => onRemoveReference('texts', text)}
                  className="ml-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar referència"
                >
                  ×
                </button>
              </div>
            ))}
            {activeEditField === 'new-texts-reference' ? (
              <div className="flex items-center">
                <input
                  type="text"
                  autoFocus
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Introdueix el text de referència"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveReference('texts', e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      setActiveEditField(null);
                    }
                  }}
                  onBlur={(e) => handleSaveReference('texts', e.target.value)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleAddReference('texts')}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
              >
                + Afegir text de referència
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
