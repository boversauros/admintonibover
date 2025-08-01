"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Post, Category, ImageData } from "@/app/_lib/types";
import {
  Save,
  ArrowLeft,
  PlusCircle,
  X,
  Upload,
  Image as ImageIcon,
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

    // For now, create a local URL (before Supabase integration)
    const localUrl = URL.createObjectURL(file);

    const imageData: ImageData = {
      id: Date.now(), // Temporary ID
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

  if (loading) {
    return (
      <div className="bg-black text-white min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Carregant...</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white min-h-screen">
      {/* Toolbar */}
      <div className="fixed top-0 left-0 right-0 bg-black/95 border-b border-gray-800/50 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center h-20 px-6">
          <button
            type="button"
            className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tornar</span>
          </button>

          <button
            type="submit"
            form="post-form"
            className="flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
            disabled={saving || isLoading}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Guardant..." : "Guardar"}</span>
          </button>
        </div>
      </div>

      {/* Form */}
      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <form id="post-form" onSubmit={handleSubmit} className="space-y-8">
            {/* Title */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Títol</label>
              <input
                type="text"
                value={post.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                placeholder="Títol de l'article..."
                required
              />
            </div>

            {/* Category and Language */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Categoria
                </label>
                <select
                  value={post.category_id}
                  onChange={(e) =>
                    updateField("category_id", Number(e.target.value))
                  }
                  className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Idioma
                </label>
                <select
                  value={post.language}
                  onChange={(e) =>
                    updateField("language", e.target.value as "ca" | "en")
                  }
                  className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Contingut
              </label>
              <textarea
                value={post.content}
                onChange={(e) => updateField("content", e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600 min-h-[300px] font-mono text-sm"
                placeholder="<p>Escriu el contingut HTML aquí...</p>"
              />
            </div>

            {/* Featured Image */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Imatge principal
              </label>
              <div className="space-y-2">
                {post.image ? (
                  <div className="relative">
                    <img
                      src={post.image.url}
                      alt={post.image.title}
                      className="w-full h-64 object-cover rounded"
                    />
                    <button
                      type="button"
                      onClick={() => updateImage(null)}
                      className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-gray-800 rounded p-8 text-center block cursor-pointer hover:border-gray-600">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-gray-400">Click to upload image</p>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, "main")}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Thumbnail Image */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Miniatura
              </label>
              <div className="space-y-2">
                {post.thumbnail ? (
                  <div className="relative inline-block">
                    <img
                      src={post.thumbnail.url}
                      alt={post.thumbnail.title}
                      className="w-32 h-32 object-cover rounded"
                    />
                    <button
                      type="button"
                      onClick={() => updateThumbnail(null)}
                      className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-gray-800 rounded p-4 text-center cursor-pointer hover:border-gray-600 w-32 h-32 flex flex-col items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-gray-400 mb-1" />
                    <p className="text-gray-400 text-xs">Add thumbnail</p>
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

            {/* References */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Referències d'imatges
                </label>
                <div className="space-y-2 mb-2">
                  {post.references.images.map((ref, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="flex-1 bg-gray-900 px-3 py-2 rounded text-sm">
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
                    className="flex-1 bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                    placeholder="URL de la imatge..."
                  />
                  <button
                    type="button"
                    onClick={() => handleAddReference("images", newImageRef)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Referències de text
                </label>
                <div className="space-y-2 mb-2">
                  {post.references.texts.map((ref, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="flex-1 bg-gray-900 px-3 py-2 rounded text-sm">
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
                    className="flex-1 bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                    placeholder="Font o referència..."
                  />
                  <button
                    type="button"
                    onClick={() => handleAddReference("texts", newTextRef)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Paraules clau
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {post.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="bg-gray-800 px-3 py-1 rounded text-sm flex items-center gap-2"
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
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" &&
                    (e.preventDefault(), handleAddKeyword())
                  }
                  className="flex-1 bg-gray-900 border border-gray-800 rounded px-4 py-2 text-white focus:outline-none focus:border-gray-600"
                  placeholder="Nova paraula clau..."
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Publish Status */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_published"
                checked={post.is_published}
                onChange={(e) => updateField("is_published", e.target.checked)}
                className="w-4 h-4 bg-gray-900 border-gray-800 rounded text-green-500"
              />
              <label htmlFor="is_published" className="text-gray-300">
                Publicar article
              </label>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};
