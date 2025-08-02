"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Post, Category, ImageData } from "@/app/_lib/types";
import {
  ArrowLeft,
  Save,
  Upload,
  X,
  PlusCircle,
  Eye,
  Type,
  Tag,
  Bookmark,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LANGUAGES } from "@/app/_lib/mock-data";
import { usePostEditor } from "@/app/_hooks/usePost";

interface PostFormProps {
  post?: Post;
  categories: Category[];
  onSave: (
    postData: Omit<Post, "id" | "created_at" | "updated_at">
  ) => Promise<void>;
  isLoading?: boolean;
}

export const PostForm: React.FC<PostFormProps> = ({
  post: initialPost,
  categories,
  onSave,
  isLoading = false,
}) => {
  const router = useRouter();
  const {
    post,
    loading,
    updateField,
    addKeyword,
    removeKeyword,
    addReference,
    removeReference,
    getPostForSave,
    updateImage,
    updateThumbnail,
  } = usePostEditor(initialPost);

  const [activeTab, setActiveTab] = useState("content");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [newKeyword, setNewKeyword] = useState("");
  const [newImageRef, setNewImageRef] = useState("");
  const [newTextRef, setNewTextRef] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post.title.trim()) {
      alert("El títol és obligatori");
      return;
    }

    setSaving(true);
    try {
      const postData = getPostForSave();
      await onSave(postData);
      router.push("/");
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Error guardant l'article");
    } finally {
      setSaving(false);
    }
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim()) {
      addKeyword(newKeyword.trim());
      setNewKeyword("");
    }
  };

  const handleAddReference = (type: "images" | "texts", value: string) => {
    if (value.trim()) {
      addReference(type, value.trim());
      if (type === "images") {
        setNewImageRef("");
      } else {
        setNewTextRef("");
      }
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "main" | "thumbnail"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);

    const imageData: ImageData = {
      id: Date.now(),
      url: localUrl,
      title: file.name.split(".")[0],
      alt: file.name.split(".")[0],
    };

    if (type === "main") {
      updateImage(imageData);
    } else {
      updateThumbnail(imageData);
    }
  };

  const tabs = [
    { id: "content", label: "Contingut", icon: Type },
    { id: "media", label: "Mitjans", icon: Upload },
    { id: "meta", label: "Metadades", icon: Tag },
    { id: "references", label: "Referències", icon: Bookmark },
  ];

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-black/95 backdrop-blur-sm border-b border-gray-800/50 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center h-16 px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Tornar</span>
            </button>
            <div className="w-px h-6 bg-gray-700"></div>
            <h1 className="text-lg font-medium text-gray-100">
              Editor d'articles
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all"
              title={
                sidebarVisible ? "Amagar configuració" : "Mostrar configuració"
              }
            >
              <Settings className="w-4 h-4" />
              {sidebarVisible ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all">
              <Eye className="w-4 h-4" />
              <span>Previsualitzar</span>
            </button>
            <button
              type="submit"
              form="post-form"
              className="flex items-center gap-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              disabled={saving || isLoading}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Guardant..." : "Guardar"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="pt-16 flex">
        {/* Sidebar */}
        <aside
          className={`w-80 bg-gray-950/50 border-r border-gray-800/50 fixed left-0 top-16 bottom-0 overflow-y-auto transition-transform duration-300 ease-in-out z-40 ${
            sidebarVisible ? "translate-x-0" : "-translate-x-full"
          }`}
        >
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
                      updateField("category_id", Number(e.target.value))
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
                  <label className="block text-sm text-gray-400 mb-1">
                    Idioma
                  </label>
                  <select
                    value={post.language}
                    onChange={(e) =>
                      updateField("language", e.target.value as "ca" | "en")
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
                      updateField("is_published", e.target.checked)
                    }
                    className="w-4 h-4 bg-gray-900 border-gray-700 rounded text-gray-500 focus:ring-gray-500"
                  />
                  <label
                    htmlFor="is_published"
                    className="text-sm text-gray-300"
                  >
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
                      onClick={() => removeKeyword(keyword)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {post.keywords.length === 0 && (
                  <span className="text-gray-500 text-xs">
                    Cap paraula clau
                  </span>
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

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-300 ease-in-out ${
            sidebarVisible ? "ml-80" : "ml-0"
          }`}
        >
          <div className="max-w-4xl mx-auto p-6">
            <form id="post-form" onSubmit={handleSubmit}>
              {/* Title Section */}
              <div className="mb-8">
                <input
                  type="text"
                  value={post.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  className="w-full bg-transparent border-none text-3xl font-bold text-white placeholder-gray-500 focus:outline-none resize-none"
                  placeholder="Títol del teu article..."
                  style={{ lineHeight: "1.2" }}
                  required
                />
                <div className="h-px bg-gradient-to-r from-gray-700 via-gray-600 to-transparent mt-4"></div>
              </div>

              {/* Tab Navigation */}
              <div className="flex space-x-1 mb-6 bg-gray-900/30 p-1 rounded-xl">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
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

              {/* Tab Content */}
              <div className="space-y-6">
                {activeTab === "content" && (
                  <div className="space-y-4">
                    <textarea
                      value={post.content}
                      onChange={(e) => updateField("content", e.target.value)}
                      className="w-full bg-gray-900/30 border border-gray-700/50 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-gray-500/50 min-h-[400px] font-mono text-sm leading-relaxed"
                      placeholder="<p>Escriu el contingut HTML aquí...</p>"
                    />
                  </div>
                )}

                {activeTab === "media" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Featured Image */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-medium text-gray-200">
                        Imatge principal
                      </h3>
                      {post.image ? (
                        <div className="relative group">
                          <img
                            src={post.image.url}
                            alt={post.image.title}
                            className="w-full h-48 object-cover rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => updateImage(null)}
                            className="absolute top-3 right-3 bg-red-600/90 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center block cursor-pointer hover:border-gray-600 transition-colors">
                          <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                          <p className="text-gray-400 mb-1">
                            Afegir imatge principal
                          </p>
                          <p className="text-gray-500 text-sm">
                            PNG, JPG fins a 10MB
                          </p>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e, "main")}
                          />
                        </label>
                      )}
                    </div>

                    {/* Thumbnail */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-medium text-gray-200">
                        Miniatura
                      </h3>
                      {post.thumbnail ? (
                        <div className="relative group w-fit">
                          <img
                            src={post.thumbnail.url}
                            alt={post.thumbnail.title}
                            className="w-32 h-32 object-cover rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() => updateThumbnail(null)}
                            className="absolute top-2 right-2 bg-red-600/90 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-gray-600 w-32 h-32 flex flex-col items-center justify-center transition-colors">
                          <Upload className="w-6 h-6 text-gray-400 mb-2" />
                          <p className="text-gray-400 text-xs">Miniatura</p>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e, "thumbnail")}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "meta" && (
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
                          onKeyPress={(e) =>
                            e.key === "Enter" &&
                            (e.preventDefault(), handleAddKeyword())
                          }
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
                        {post.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="bg-gray-800/50 border border-gray-700 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
                          >
                            {keyword}
                            <button
                              type="button"
                              onClick={() => removeKeyword(keyword)}
                              className="text-gray-400 hover:text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "references" && (
                  <div className="space-y-8">
                    {/* Image References */}
                    <div>
                      <label className="block text-lg font-medium text-gray-200 mb-3">
                        Referències d'imatges
                      </label>
                      <div className="space-y-3 mb-4">
                        {post.references.images.map((ref, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg"
                          >
                            <span className="flex-1 text-sm text-gray-300">
                              {ref}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeReference("images", ref)}
                              className="text-gray-400 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newImageRef}
                          onChange={(e) => setNewImageRef(e.target.value)}
                          onKeyPress={(e) =>
                            e.key === "Enter" &&
                            (e.preventDefault(),
                            handleAddReference("images", newImageRef))
                          }
                          className="flex-1 bg-gray-900/30 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500/50"
                          placeholder="URL de la imatge..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAddReference("images", newImageRef)
                          }
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Text References */}
                    <div>
                      <label className="block text-lg font-medium text-gray-200 mb-3">
                        Referències de text
                      </label>
                      <div className="space-y-3 mb-4">
                        {post.references.texts.map((ref, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg"
                          >
                            <span className="flex-1 text-sm text-gray-300">
                              {ref}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeReference("texts", ref)}
                              className="text-gray-400 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTextRef}
                          onChange={(e) => setNewTextRef(e.target.value)}
                          onKeyPress={(e) =>
                            e.key === "Enter" &&
                            (e.preventDefault(),
                            handleAddReference("texts", newTextRef))
                          }
                          className="flex-1 bg-gray-900/30 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-gray-500/50"
                          placeholder="Font o referència..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAddReference("texts", newTextRef)
                          }
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};
