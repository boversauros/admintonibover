"use client";
import React from "react";
import { ChevronLeft, X } from "lucide-react";
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
      className={`w-80 bg-black border-r border-white fixed left-0 top-0 bottom-0 overflow-y-auto transition-transform duration-300 ease-in-out z-40 ${
        visible ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Sidebar Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-white">
        <h1 className="text-lg font-serif italic text-white">
          Editor d&#39;articles
        </h1>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-all"
          title="Amagar sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Quick Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
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
                className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-white"
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
                className="w-full bg-black border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-white"
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
                className="w-4 h-4 bg-black border-gray-700 rounded text-white focus:ring-white"
              />
              <label htmlFor="is_published" className="text-sm text-gray-300">
                Publicar article
              </label>
            </div>
          </div>
        </div>

        {/* Keywords Display */}
        <div className="space-y-3">
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
            Paraules clau
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {post.keywords.map((keyword) => (
              <span
                key={keyword}
                className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs flex items-center gap-1"
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
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
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
