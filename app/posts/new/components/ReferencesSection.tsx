import React from "react";
import { EditableArrayField } from "./EditableArrayField";
import { PostReferences, ImageData } from "../../../../types";

interface ReferencesSectionProps {
  references: PostReferences;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onArrayAdd: (arrayPath: string, defaultValue: string | ImageData) => void;
  onArrayRemove: (arrayPath: string, index: number) => void;
  onArrayUpdate: (
    arrayPath: string,
    index: number,
    value: string | ImageData
  ) => void;
}

export const ReferencesSection: React.FC<ReferencesSectionProps> = ({
  references,
  activeEditField,
  setActiveEditField,
  onArrayAdd,
  onArrayRemove,
  onArrayUpdate,
}) => {
  return (
    <div className="border-t border-gray-800 pt-8">
      <h2 className="text-xl font-serif mb-6">Referències</h2>

      <h3 className="text-lg font-serif mb-3 text-gray-200">Imatges</h3>
      <EditableArrayField
        items={references.images}
        arrayPath="references.images"
        itemLabel="referència d'imatge"
        defaultValue="Nova referència d'imatge"
        activeEditField={activeEditField}
        setActiveEditField={setActiveEditField}
        onArrayAdd={onArrayAdd}
        onArrayRemove={onArrayRemove}
        onArrayUpdate={onArrayUpdate}
      />

      <h3 className="text-lg font-serif mb-3 mt-6 text-gray-200">Textos</h3>
      <EditableArrayField
        items={references.texts}
        arrayPath="references.texts"
        itemLabel="referència de text"
        defaultValue="Nova referència de text"
        activeEditField={activeEditField}
        setActiveEditField={setActiveEditField}
        onArrayAdd={onArrayAdd}
        onArrayRemove={onArrayRemove}
        onArrayUpdate={onArrayUpdate}
      />
    </div>
  );
};
