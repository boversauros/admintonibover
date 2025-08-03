"use client";
import React, { useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { PostReferences } from "@/app/_lib/types";

interface ReferencesTabProps {
  references: PostReferences;
  onAddReference: (type: "images" | "texts", value: string) => void;
  onRemoveReference: (type: "images" | "texts", value: string) => void;
}

export const ReferencesTab: React.FC<ReferencesTabProps> = ({
  references,
  onAddReference,
  onRemoveReference,
}) => {
  const [newImageRef, setNewImageRef] = useState("");
  const [newTextRef, setNewTextRef] = useState("");

  const handleAddReference = (type: "images" | "texts") => {
    const value = type === "images" ? newImageRef : newTextRef;
    if (value.trim()) {
      onAddReference(type, value.trim());
      if (type === "images") {
        setNewImageRef("");
      } else {
        setNewTextRef("");
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, type: "images" | "texts") => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddReference(type);
    }
  };

  return (
    <div className="space-y-8">
      {/* Image References */}
      <div>
        <label className="block text-lg font-serif italic text-gray-200 mb-3">
          Referències d'imatges
        </label>
        <div className="space-y-3 mb-4">
          {references.images.map((ref, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg"
            >
              <span className="flex-1 text-sm text-gray-300">{ref}</span>
              <button
                type="button"
                onClick={() => onRemoveReference("images", ref)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newImageRef}
            onChange={(e) => setNewImageRef(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, "images")}
            className="flex-1 bg-gray-900/30 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500/50"
            placeholder="URL de la imatge..."
          />
          <button
            type="button"
            onClick={() => handleAddReference("images")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Text References */}
      <div>
        <label className="block text-lg font-serif italic text-gray-200 mb-3">
          Referències de text
        </label>
        <div className="space-y-3 mb-4">
          {references.texts.map((ref, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg"
            >
              <span className="flex-1 text-sm text-gray-300">{ref}</span>
              <button
                type="button"
                onClick={() => onRemoveReference("texts", ref)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTextRef}
            onChange={(e) => setNewTextRef(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, "texts")}
            className="flex-1 bg-gray-900/30 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500/50"
            placeholder="Font o referència..."
          />
          <button
            type="button"
            onClick={() => handleAddReference("texts")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
