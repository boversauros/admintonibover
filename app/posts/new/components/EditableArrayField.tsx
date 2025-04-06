import { PlusCircle, X } from "lucide-react";
import { EditableField } from "./EditableField";
import { ImageData } from "../../../../types";

export interface EditableArrayFieldProps {
  items: (string | ImageData)[];
  arrayPath: string;
  itemLabel: string;
  defaultValue?: string;
  isImageArray?: boolean;
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

export const EditableArrayField: React.FC<EditableArrayFieldProps> = ({
  items,
  arrayPath,
  itemLabel,
  defaultValue = "",
  isImageArray = false,
  activeEditField,
  setActiveEditField,
  onArrayAdd,
  onArrayRemove,
  onArrayUpdate,
}) => {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2 group relative">
          {isImageArray ? (
            <div className="relative w-full">
              <div className="aspect-video relative overflow-hidden rounded bg-gray-800">
                <img
                  src={(item as ImageData).url}
                  alt={(item as ImageData).title}
                  className="w-full h-full object-cover transition-opacity duration-700 hover:opacity-95"
                />
                <div className="absolute inset-0 group-hover:bg-black/50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                  <div className="absolute inset-0 border border-dashed border-gray-500 rounded-sm opacity-0 group-hover:opacity-100 pointer-events-none"></div>
                  <button className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded">
                    Canviar imatge
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-400 font-serif italic">
                <EditableField
                  value={(item as ImageData).title}
                  fieldName="title"
                  index={index}
                  arrayPath={arrayPath}
                  isArray={true}
                  activeEditField={activeEditField}
                  setActiveEditField={setActiveEditField}
                  onChange={() => {}}
                  onArrayUpdate={onArrayUpdate}
                />
              </p>
            </div>
          ) : (
            <EditableField
              value={item as string}
              fieldName={arrayPath}
              index={index}
              arrayPath={arrayPath}
              isArray={true}
              className="flex-grow"
              activeEditField={activeEditField}
              setActiveEditField={setActiveEditField}
              onChange={() => {}}
              onArrayUpdate={onArrayUpdate}
            />
          )}
          <button
            onClick={() => onArrayRemove(arrayPath, index)}
            className="text-gray-500 hover:text-white transition-colors mt-1"
            title="Eliminar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ))}

      <button
        onClick={() =>
          onArrayAdd(
            arrayPath,
            isImageArray
              ? {
                  url: "https://picsum.photos/id/3/1200/800",
                  title: "Nova imatge",
                }
              : defaultValue
          )
        }
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors mt-2"
      >
        <PlusCircle className="w-4 h-4" />
        <span>Afegir {itemLabel}</span>
      </button>
    </div>
  );
};
