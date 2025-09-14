// app/posts/_components/PostFormV2/PostFormSidebarV2.tsx
"use client";
import React from "react";
import { ChevronLeft, X, Globe, Check } from "lucide-react";
import { PostWithTranslationsV2, CategoryV2 } from "@/app/_lib/types-v2";
import { Language } from "@/app/_lib/types";
import { LANGUAGES } from "@/app/_lib/mock-data";

interface PostFormSidebarV2Props {
  visible: boolean;
  post: PostWithTranslationsV2;
  categories: CategoryV2[];
  activeLanguage: Language;
  availableTranslations: Language[];
  onUpdateField: <
    K extends keyof Pick<
      PostWithTranslationsV2,
      "category_id" | "is_published" | "date"
    >
  >(
    field: K,
    value: PostWithTranslationsV2[K]
  ) => void;
  onLanguageChange: (language: Language) => void;
  onRemoveKeyword: (keyword: string) => void;
  onToggleSidebar: () => void;
}

export const PostFormSidebarV2: React.FC<PostFormSidebarV2Props> = ({
  visible,
  post,
  categories,
  activeLanguage,
  availableTranslations,
  onUpdateField,
  onLanguageChange,
  onRemoveKeyword,
  onToggleSidebar,
}) => {
  // Get keywords for active language
  const currentTranslation = post.translations[activeLanguage];
  const currentKeywords =
    currentTranslation?.keywords?.map((k) =>
      typeof k === "string" ? k : k.keyword
    ) || [];

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
        {/* Language Management Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-3 h-3" />
            Traduccions
          </h3>

          <div className="space-y-2">
            {LANGUAGES.map((lang) => {
              const isActive = lang.code === activeLanguage;
              const hasTranslation = availableTranslations.includes(
                lang.code as Language
              );

              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onLanguageChange(lang.code as Language)}
                  className={`w-full text-left px-3 py-2 rounded transition-all flex items-center justify-between ${
                    isActive
                      ? "bg-white text-black"
                      : hasTranslation
                      ? "bg-gray-900 text-gray-300 hover:bg-gray-800"
                      : "bg-gray-900/50 text-gray-500 hover:bg-gray-900 border border-dashed border-gray-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{lang.name}</span>
                    {!hasTranslation && (
                      <span className="text-xs text-gray-500">(crear)</span>
                    )}
                  </span>
                  {hasTranslation && (
                    <Check className="w-3 h-3 text-green-500" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>
              • {availableTranslations.length} de {LANGUAGES.length} traduccions
            </p>
            {currentTranslation && (
              <p>
                • Editant:{" "}
                {LANGUAGES.find((l) => l.code === activeLanguage)?.name}
              </p>
            )}
          </div>
        </div>

        {/* Quick Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
            Configuració general
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

        {/* Keywords Display for Active Language */}
        {currentTranslation && (
          <div className="space-y-3">
            <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
              Paraules clau ({activeLanguage.toUpperCase()})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {currentKeywords.map((keyword) => (
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
              {currentKeywords.length === 0 && (
                <span className="text-gray-500 text-xs">
                  Cap paraula clau en{" "}
                  {activeLanguage === "ca" ? "català" : "anglès"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-normal text-gray-400 uppercase tracking-wider">
            Estat
          </h3>
          <div className="space-y-2">
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

            {/* Translation status */}
            <div className="text-xs text-gray-500 space-y-1">
              {LANGUAGES.map((lang) => {
                const translation = post.translations[lang.code as Language];
                const hasContent = translation && translation.title;
                return (
                  <div key={lang.code} className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasContent ? "bg-green-600" : "bg-gray-700"
                      }`}
                    ></div>
                    <span>
                      {lang.name}: {hasContent ? "Completat" : "Pendent"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
