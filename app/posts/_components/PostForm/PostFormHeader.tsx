"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, Settings } from "lucide-react";

interface PostFormHeaderProps {
  postId: number;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  onSave: () => void;
  saving: boolean;
  isLoading?: boolean;
}

export const PostFormHeader: React.FC<PostFormHeaderProps> = ({
  postId,
  sidebarVisible,
  onToggleSidebar,
  onSave,
  saving,
  isLoading = false,
}) => {
  const router = useRouter();

  return (
    <header
      className={`fixed top-0 right-0 bg-black/95 backdrop-blur-sm border-b border-gray-800/50 z-50 transition-all duration-300 ease-in-out ${
        sidebarVisible ? "left-80" : "left-0"
      }`}
    >
      <div className="flex justify-between items-center h-16 px-6">
        <div className="flex items-center gap-4">
          {!sidebarVisible && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
              title="Mostrar sidebar"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tornar</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {postId > 0 && (
            <Link
              href={`/posts/${postId}`}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
            >
              <Eye className="w-4 h-4" />
              <span>Previsualitzar</span>
            </Link>
          )}
          <button
            type="submit"
            form="post-form"
            className="flex items-center gap-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            disabled={saving || isLoading}
            onClick={onSave}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Guardant..." : "Guardar"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
