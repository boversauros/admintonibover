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
    <div className="flex space-x-1 mb-6 bg-gray-900/30 p-1 rounded-xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-gray-800 text-white shadow-lg"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
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
