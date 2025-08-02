"use client";
import React from "react";
import { Upload, X } from "lucide-react";
import { ImageData } from "@/app/_lib/types";

interface MediaTabProps {
  image: ImageData | null | undefined;
  thumbnail: ImageData | null | undefined;
  onImageChange: (image: ImageData | null) => void;
  onThumbnailChange: (thumbnail: ImageData | null) => void;
  onImageUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "main" | "thumbnail"
  ) => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  image,
  thumbnail,
  onImageChange,
  onThumbnailChange,
  onImageUpload,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Featured Image */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium text-gray-200">Imatge principal</h3>
        {image ? (
          <div className="relative group">
            <img
              src={image.url}
              alt={image.title}
              className="w-full h-48 object-cover rounded-xl"
            />
            <button
              type="button"
              onClick={() => onImageChange(null)}
              className="absolute top-3 right-3 bg-red-600/90 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center block cursor-pointer hover:border-gray-600 transition-colors">
            <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-400 mb-1">Afegir imatge principal</p>
            <p className="text-gray-500 text-sm">PNG, JPG fins a 10MB</p>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => onImageUpload(e, "main")}
            />
          </label>
        )}
      </div>

      {/* Thumbnail */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium text-gray-200">Miniatura</h3>
        {thumbnail ? (
          <div className="relative group w-fit">
            <img
              src={thumbnail.url}
              alt={thumbnail.title}
              className="w-32 h-32 object-cover rounded-xl"
            />
            <button
              type="button"
              onClick={() => onThumbnailChange(null)}
              className="absolute top-2 right-2 bg-red-600/90 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <label className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-gray-600 w-32 h-32 flex flex-col items-center justify-center transition-colors">
            <Upload className="w-6 h-6 text-gray-400 mb-2" />
            <p className="text-gray-400 text-xs">Miniatura</p>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => onImageUpload(e, "thumbnail")}
            />
          </label>
        )}
      </div>
    </div>
  );
};
