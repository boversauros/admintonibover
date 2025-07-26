import { PostReferences } from "../../../../types";
import { EditableField } from "./EditableField";
import { PlusCircle } from "lucide-react";

interface ReferencesSectionProps {
  references: PostReferences;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onAddReference: (type: "images" | "texts", value: string) => void;
  onRemoveReference: (type: "images" | "texts", value: string) => void;
  onUpdateReferences: (type: "images" | "texts", references: string[]) => void;
}

export const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  references,
  activeEditField,
  setActiveEditField,
  onAddReference,
  onRemoveReference,
  onUpdateReferences,
}) => {
  const handleAddReference = (type: "images" | "texts") => {
    const nImages = references.images.length;
    const nTexts = references.texts.length;
    // Add empty reference and immediately start editing it
    onAddReference(
      type,
      `nova referencia ${type === "images" ? nImages : nTexts}`
    );
  };

  const handleUpdateReference = (
    type: "images" | "texts",
    index: number,
    value: string
  ) => {
    if (value.trim() === "") {
      // If the field is empty, remove the reference by index
      const currentItems = [
        ...(type === "images" ? references.images : references.texts),
      ];
      currentItems.splice(index, 1);
      onUpdateReferences(type, currentItems);
    } else {
      // Update the reference by creating a new array with the updated value
      const currentItems = [
        ...(type === "images" ? references.images : references.texts),
      ];
      currentItems[index] = value.trim();
      onUpdateReferences(type, currentItems);
    }
  };

  const renderReferenceList = (type: "images" | "texts", items: string[]) => (
    <div>
      <h3 className="text-lg font-serif mb-3 text-gray-200">
        {type === "images" ? "Imatges" : "Textos"}
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
                  className="flex-1 text-gray-300 hover:text-white transition-colors text-sm px-3 py-1 w-full"
                  activeEditField={activeEditField}
                  setActiveEditField={setActiveEditField}
                  onChange={(field, value) =>
                    handleUpdateReference(type, index, value)
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveReference(type, item)}
                className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity px-2"
                title={`Eliminar ${type === "images" ? "imatge" : "text"}`}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => handleAddReference(type)}
          className="text-sm flex items-center mt-1 text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 mr-1" />
          {`Afegir ${type === "images" ? "URL" : "text"} de referència`}
        </button>
      </div>
    </div>
  );

  return (
    <div className="border-t border-gray-800 pt-8">
      <h2 className="text-xl font-serif mb-6 text-gray-200">Referències</h2>
      <div className="space-y-8">
        {renderReferenceList("images", references.images)}
        {renderReferenceList("texts", references.texts)}
      </div>
    </div>
  );
};
