// app/posts/_components/PostFormV2/index.tsx
"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CategoryV2, ImageDataV2 } from "@/app/_lib/types-v2";
import { usePostEditorV2 } from "@/app/_hooks/usePost-v2";
import { PostFormHeaderV2 } from "./PostFormHeaderV2";
import { PostFormSidebarV2 } from "./PostFormSidebarV2";
import { PostFormTabs } from "../PostForm/PostFormTabs";
import { ContentTab } from "../PostForm/tabs/ContentTab";
import { MediaTab } from "../PostForm/tabs/MediaTab";
import { MetadataTab } from "../PostForm/tabs/MetadataTab";
import { ReferencesTab } from "../PostForm/tabs/ReferencesTab";
import { Language } from "@/app/_lib/types";
import { Globe, Plus, AlertCircle } from "lucide-react";

interface PostFormV2Props {
  postId?: number;
  categories: CategoryV2[];
}

export const PostFormV2: React.FC<PostFormV2Props> = ({
  postId,
  categories,
}) => {
  const router = useRouter();
  const {
    post,
    loading,
    saving,
    error,
    activeLanguage,
    setActiveLanguage,
    availableLanguages,
    hasTranslation,
    updateCoreField,
    updateImage,
    updateThumbnail,
    updateTranslationField,
    addKeyword,
    removeKeyword,
    getKeywords,
    addReference,
    removeReference,
    getReferences,
    createTranslation,
    deleteTranslation,
    save,
  } = usePostEditorV2({ postId, defaultLanguage: "ca" });

  const [activeTab, setActiveTab] = useState("content");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Get current translation
  const currentTranslation = post.translations[activeLanguage];
  const currentTitle = currentTranslation?.title || "";
  const currentContent = currentTranslation?.content || "";
  const currentKeywords = getKeywords(activeLanguage);
  const currentReferences = getReferences(activeLanguage);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Check if at least one translation has a title
    const hasValidTranslation = Object.values(post.translations).some((t) =>
      t?.title?.trim()
    );

    if (!hasValidTranslation) {
      alert("Cal afegir almenys un títol en un idioma");
      return;
    }

    try {
      await save();
      router.push("/");
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Error guardant l'article");
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "main" | "thumbnail"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);

    const imageData: ImageDataV2 = {
      id: Date.now(),
      url: localUrl,
      title: file.name.split(".")[0],
      alt: file.name.split(".")[0],
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (type === "main") {
      updateImage(imageData);
    } else {
      updateThumbnail(imageData);
    }
  };

  const handleLanguageChange = (newLanguage: Language) => {
    // Check if translation exists, if not, ask to create it
    if (!hasTranslation(newLanguage)) {
      if (
        confirm(
          `Vols crear una traducció en ${
            newLanguage === "ca" ? "Català" : "Anglès"
          }?`
        )
      ) {
        createTranslation(newLanguage);
      } else {
        return;
      }
    }
    setActiveLanguage(newLanguage);
  };

  const handleDeleteTranslation = (language: Language) => {
    if (Object.keys(post.translations).length <= 1) {
      alert("Has de mantenir almenys una traducció");
      return;
    }

    if (
      confirm(
        `Segur que vols eliminar la traducció en ${
          language === "ca" ? "Català" : "Anglès"
        }?`
      )
    ) {
      deleteTranslation(language);
      // Switch to another available language
      const remainingLang = availableLanguages.find(
        (l) => l !== language && hasTranslation(l)
      );
      if (remainingLang) {
        setActiveLanguage(remainingLang);
      }
    }
  };

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      <PostFormHeaderV2
        postId={post.id}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onSave={handleSubmit}
        saving={saving}
      />

      <div className="flex">
        <PostFormSidebarV2
          visible={sidebarVisible}
          post={post}
          categories={categories}
          activeLanguage={activeLanguage}
          availableTranslations={Object.keys(post.translations) as Language[]}
          onUpdateField={updateCoreField}
          onLanguageChange={handleLanguageChange}
          onRemoveKeyword={(keyword) => removeKeyword(keyword, activeLanguage)}
          onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        />

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-300 ease-in-out pt-16 ${
            sidebarVisible ? "ml-80" : "ml-0"
          }`}
        >
          <div className="max-w-4xl mx-auto p-6">
            <form id="post-form" onSubmit={handleSubmit}>
              {/* Language Indicator Bar */}
              <div className="mb-6 p-3 bg-gray-900 rounded-lg border border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">
                      Editant traducció:
                    </span>
                    <div className="flex gap-2">
                      {availableLanguages.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => handleLanguageChange(lang)}
                          className={`px-3 py-1 rounded text-sm transition-all ${
                            lang === activeLanguage
                              ? "bg-white text-black"
                              : hasTranslation(lang)
                              ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                              : "bg-gray-900 text-gray-500 border border-gray-800 hover:border-gray-700"
                          }`}
                        >
                          {lang === "ca" ? "Català" : "English"}
                          {!hasTranslation(lang) && " (+)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {hasTranslation(activeLanguage) &&
                    Object.keys(post.translations).length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTranslation(activeLanguage)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Eliminar traducció
                      </button>
                    )}
                </div>

                {!currentTranslation && (
                  <div className="mt-3 p-3 bg-gray-800 rounded flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-300">
                      No hi ha traducció en{" "}
                      {activeLanguage === "ca" ? "Català" : "Anglès"}. Fes clic
                      al botó per crear-la.
                    </span>
                    <button
                      type="button"
                      onClick={() => createTranslation(activeLanguage)}
                      className="ml-auto px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Crear traducció
                    </button>
                  </div>
                )}
              </div>

              {/* Title Section - Language Specific */}
              {currentTranslation && (
                <div className="mb-8">
                  <input
                    type="text"
                    value={currentTitle}
                    onChange={(e) =>
                      updateTranslationField(
                        "title",
                        e.target.value,
                        activeLanguage
                      )
                    }
                    className="w-full bg-transparent border-none text-3xl font-bold text-white placeholder-gray-500 focus:outline-none resize-none"
                    placeholder={`Títol del teu article en ${
                      activeLanguage === "ca" ? "Català" : "Anglès"
                    }...`}
                    style={{ lineHeight: "1.2" }}
                  />
                  <div className="h-px bg-gradient-to-r from-gray-700 via-gray-600 to-transparent mt-4"></div>
                </div>
              )}

              {/* Tab Navigation */}
              <PostFormTabs activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Tab Content */}
              {currentTranslation && (
                <div className="space-y-6">
                  {activeTab === "content" && (
                    <ContentTab
                      content={currentContent}
                      onContentChange={(content) =>
                        updateTranslationField(
                          "content",
                          content,
                          activeLanguage
                        )
                      }
                    />
                  )}

                  {activeTab === "media" && (
                    <MediaTab
                      image={post.image}
                      thumbnail={post.thumbnail}
                      onImageChange={(image) =>
                        updateImage(image as ImageDataV2 | null)
                      }
                      onThumbnailChange={(thumbnail) =>
                        updateThumbnail(thumbnail as ImageDataV2 | null)
                      }
                      onImageUpload={handleImageUpload}
                    />
                  )}

                  {activeTab === "meta" && (
                    <MetadataTab
                      keywords={currentKeywords}
                      language={activeLanguage}
                      onAddKeyword={(keyword) =>
                        addKeyword(keyword, activeLanguage)
                      }
                      onRemoveKeyword={(keyword) =>
                        removeKeyword(keyword, activeLanguage)
                      }
                    />
                  )}

                  {activeTab === "references" && (
                    <ReferencesTab
                      references={currentReferences}
                      onAddReference={(type, value) =>
                        addReference(type, value, activeLanguage)
                      }
                      onRemoveReference={(type, value) =>
                        removeReference(type, value, activeLanguage)
                      }
                    />
                  )}
                </div>
              )}

              {!currentTranslation && (
                <div className="py-12 text-center text-gray-400">
                  <p className="mb-4">
                    No hi ha traducció en{" "}
                    {activeLanguage === "ca" ? "Català" : "Anglès"}
                  </p>
                  <button
                    type="button"
                    onClick={() => createTranslation(activeLanguage)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4 inline-block mr-2" />
                    Crear traducció
                  </button>
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};
