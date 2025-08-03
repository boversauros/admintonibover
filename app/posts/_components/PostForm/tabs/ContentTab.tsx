"use client";
import React from "react";

interface ContentTabProps {
  content: string;
  onContentChange: (content: string) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({
  content,
  onContentChange,
}) => {
  return (
    <div className="space-y-4">
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className="w-full bg-black border border-gray-700 rounded px-4 py-4 text-white focus:outline-none focus:border-white min-h-[400px] font-mono text-sm leading-relaxed"
        placeholder="<p>Escriu el contingut HTML aquí...</p>"
      />
    </div>
  );
};
