import { X, Upload, Image as ImageIcon } from "lucide-react";
import { ImageData } from "../../../../types";
import { EditableField } from "./EditableField";
import { useCallback, useRef } from "react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create a URL for the selected file
    const fileUrl = URL.createObjectURL(file);
    
    // Update the parent component with the new image
    onImageUpdate({
      url: fileUrl,
      title: file.name.split('.')[0], // Use filename without extension as title
      file // Keep the file reference for later upload
    });
    
    // Reset the input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImageUpdate]);

  if (!image) {
    return (
      <>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded hover:border-gray-600 transition-colors cursor-pointer h-[400px] w-full p-4 text-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-500 mb-2" />
          <p className="text-sm text-gray-400 mb-1">Arrossega una imatge o fes clic per pujar</p>
          <p className="text-xs text-gray-500">PNG, JPG, GIF fins a 5MB</p>
        </div>
      </>
    );
  }

  return (
    <div className="w-full group relative">
      {image.file && (
        <div className="absolute -top-8 left-0 right-0 text-center">
          <span className="inline-block bg-blue-500 text-white text-xs px-2 py-1 rounded">
            No oblidis guardar el post per pujar la imatge
          </span>
        </div>
      )}
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
      <div className="text-sm text-gray-400 font-serif italic mt-2">
        <EditableField
          value={image.title}
          fieldName="imageTitle"
          isArray={false}
          activeEditField={activeEditField}
          setActiveEditField={setActiveEditField}
          onChange={(_field, value) => onImageUpdate({ ...image, title: value })}
        />
      </div>
    </div>
  );
};
