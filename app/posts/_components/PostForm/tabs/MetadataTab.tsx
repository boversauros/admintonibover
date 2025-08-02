"use client";
import React, { useState } from "react";
import { PlusCircle, X } from "lucide-react";

interface MetadataTabProps {
  keywords: string[];
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({
  keywords,
  onAddKeyword,
  onRemoveKeyword,
}) => {
  const [newKeyword, setNewKeyword] = useState("");

  const handleAddKeyword = () => {
    if (newKeyword.trim()) {
      onAddKeyword(newKeyword.trim());
      setNewKeyword("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-lg font-medium text-gray-200 mb-3">
          Paraules clau
        </label>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1 bg-gray-900/30 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500/50"
            placeholder="Nova paraula clau..."
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <span
              key={keyword}
              className="bg-gray-800/50 border border-gray-700 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
            >
              {keyword}
              <button
                type="button"
                onClick={() => onRemoveKeyword(keyword)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
