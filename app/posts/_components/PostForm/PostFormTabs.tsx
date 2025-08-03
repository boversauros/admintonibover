"use client";
import React from "react";
import { Type, Upload, Tag, Bookmark } from "lucide-react";

export interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PostFormTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const tabs: Tab[] = [
  { id: "content", label: "Contingut", icon: Type },
  { id: "media", label: "Mitjans", icon: Upload },
  { id: "meta", label: "Metadades", icon: Tag },
  { id: "references", label: "Referències", icon: Bookmark },
];

export const PostFormTabs: React.FC<PostFormTabsProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="flex space-x-6 mb-6 border-b border-gray-700">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-normal transition-all border-b-2 ${
              activeTab === tab.id
                ? "text-white border-white"
                : "text-gray-400 hover:text-gray-200 border-transparent"
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
