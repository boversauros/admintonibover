"use client";
import React from "react";
import { KeywordSearch } from "@/app/posts/_components/ui/KeywordSearch";

interface MetadataTabProps {
  keywords: string[];
  language: "ca" | "en";
  onAddKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({
  keywords,
  language,
  onAddKeyword,
  onRemoveKeyword,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-200 mb-4">
          Paraules clau
        </h3>
        <KeywordSearch
          currentKeywords={keywords}
          language={language}
          onAddKeyword={onAddKeyword}
          onRemoveKeyword={onRemoveKeyword}
        />
      </div>
    </div>
  );
};
