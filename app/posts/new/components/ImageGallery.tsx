import { PlusCircle, X } from "lucide-react";
import { ImageData } from "../../../../types";
import { EditableField } from "./EditableField";

interface ImageGalleryProps {
  images: ImageData[];
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onArrayUpdate: (
    arrayPath: string,
    index: number,
    value: string | ImageData
  ) => void;
  onArrayRemove: (arrayPath: string, index: number) => void;
  onArrayAdd: (arrayPath: string, defaultValue: ImageData) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  activeEditField,
  setActiveEditField,
  onArrayUpdate,
  onArrayRemove,
  onArrayAdd,
}) => {
  return (
    <div className="space-y-8">
      <div
        className={`grid gap-8 ${
          images.length === 1
            ? "grid-cols-1"
            : images.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {images.map((image, index) => (
          <div key={index} className="space-y-2 group relative">
            <div className="aspect-video relative overflow-hidden rounded bg-gray-800">
              <img
                src={image.url}
                alt={image.title}
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
                value={image.title}
                fieldName={`images.${index}.title`}
                isArray={true}
                arrayPath="images"
                index={index}
                activeEditField={activeEditField}
                setActiveEditField={setActiveEditField}
                onChange={() => {}}
                onArrayUpdate={onArrayUpdate}
              />
            </p>
            <button
              onClick={() => onArrayRemove("images", index)}
              className="absolute top-2 right-2 bg-gray-800 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Eliminar imatge"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        <div
          className="flex items-center justify-center border-2 border-dashed border-gray-800 rounded hover:border-gray-600 transition-colors cursor-pointer aspect-video"
          onClick={() =>
            onArrayAdd("images", {
              url: "https://picsum.photos/id/3/1200/800",
              title: "Nova imatge",
            })
          }
        >
          <div className="flex flex-col items-center justify-center">
            <PlusCircle className="w-8 h-8 text-gray-600" />
            <span className="mt-2 text-sm text-gray-500">Afegir imatge</span>
          </div>
        </div>
      </div>
    </div>
  );
};
