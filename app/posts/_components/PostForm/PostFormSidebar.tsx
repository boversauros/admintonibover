"use client";
import React from "react";
import { X, ChevronLeft } from "lucide-react";
import { Post, Category } from "@/app/_lib/types";
import { LANGUAGES } from "@/app/_lib/mock-data";

interface PostFormSidebarProps {
  visible: boolean;
  post: Post;
  categories: Category[];
  onUpdateField: <K extends keyof Post>(field: K, value: Post[K]) => void;
  onRemoveKeyword: (keyword: string) => void;
  onToggleSidebar: () => void;
}

export const PostFormSidebar: React.FC<PostFormSidebarProps> = ({
  visible,
  post,
  categories,
  onUpdateField,
  onRemoveKeyword,
  onToggleSidebar,
}) => {
  return (
    <aside
      className={`w-80 bg-gray-950/50 border-r border-gray-800/50 fixed left-0 top-0 bottom-0 overflow-y-auto transition-transform duration-300 ease-in-out z-40 ${
        visible ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Sidebar Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-800/50">
        <h1 className="text-lg font-medium text-gray-100">Editor d'articles</h1>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
          title="Amagar sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Quick Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Configuració
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Categoria
              </label>
              <select
                value={post.category_id}
                onChange={(e) =>
                  onUpdateField("category_id", Number(e.target.value))
                }
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Idioma</label>
              <select
                value={post.language}
                onChange={(e) =>
                  onUpdateField("language", e.target.value as "ca" | "en")
                }
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-500"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is_published"
                checked={post.is_published}
                onChange={(e) =>
                  onUpdateField("is_published", e.target.checked)
                }
                className="w-4 h-4 bg-gray-900 border-gray-700 rounded text-gray-500 focus:ring-gray-500"
              />
              <label htmlFor="is_published" className="text-sm text-gray-300">
                Publicar article
              </label>
            </div>
          </div>
        </div>

        {/* Keywords Preview */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Paraules clau
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {post.keywords.map((keyword) => (
              <span
                key={keyword}
                className="bg-gray-700/30 text-gray-300 px-2 py-1 rounded text-xs flex items-center gap-1"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => onRemoveKeyword(keyword)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {post.keywords.length === 0 && (
              <span className="text-gray-500 text-xs">Cap paraula clau</span>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Estat
          </h3>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                post.is_published ? "bg-green-500" : "bg-yellow-500"
              }`}
            ></div>
            <span className="text-sm text-gray-300">
              {post.is_published ? "Publicat" : "Esborrany"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
