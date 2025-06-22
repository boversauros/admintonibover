import { X } from "lucide-react";
import { ImageData } from "../../../../types";
import { EditableField } from "./EditableField";

interface PostImageProps {
  image: ImageData | null;
  activeEditField: string | null;
  setActiveEditField: (field: string | null) => void;
  onImageUpdate: (image: ImageData) => void;
  onImageRemove: () => void;
}

export const PostImage: React.FC<PostImageProps> = ({
  image,
  activeEditField,
  setActiveEditField,
  onImageUpdate,
  onImageRemove,
}) => {
  if (!image) {
    return (
      <div
        className="flex items-center justify-center border-2 border-dashed border-gray-800 rounded hover:border-gray-600 transition-colors cursor-pointer h-[400px] w-full"
        onClick={() =>
          onImageUpdate({
            url: "https://picsum.photos/id/3/1200/800",
            title: "Imatge del post",
          })
        }
      >
        <div className="flex flex-col items-center justify-center">
          <span className="text-sm text-gray-500">Afegir imatge</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full group">
      <div className="relative">
        <img
          src={image.url}
          alt={image.title}
          className="w-full h-[400px] object-cover"
        />
        <button
          onClick={onImageRemove}
          className="absolute top-4 right-4 bg-gray-800 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Eliminar imatge"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-400 font-serif italic mt-2">
        <EditableField
          value={image.title}
          fieldName="image.title"
          isArray={false}
          activeEditField={activeEditField}
          setActiveEditField={setActiveEditField}
          onChange={(value) => onImageUpdate({ ...image, title: value })}
        />
      </p>
    </div>
  );
};
